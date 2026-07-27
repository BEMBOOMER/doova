//! Dictation through Apple's on-device Speech framework.
//!
//! `SFSpeechRecognitionTask` stops accepting audio after roughly a minute, so a
//! long dictation is really a chain of short recognition tasks over one shared
//! `AVAudioEngine`. Every time a task finalises we tear down just the request
//! and the tap, then start a fresh pair while the engine keeps running. The
//! frontend stitches the finalised segments back together.
//!
//! Objective-C objects are not `Send`, so the whole session lives in a
//! thread-local on the main thread and every mutation is funnelled through
//! `run_on_main_thread`. Callbacks arrive on arbitrary queues and only touch
//! atomics plus `AppHandle::emit`, both of which are safe from any thread.

use std::cell::RefCell;
use std::ptr::NonNull;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::time::Duration;

use block2::{DynBlock, RcBlock};
use objc2::rc::Retained;
use objc2::runtime::{Bool, NSObjectProtocol};
use objc2::{sel, AllocAnyThread};
use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};
use objc2_avf_audio::{
    AVAudioEngine, AVAudioInputNode, AVAudioNodeBus, AVAudioPCMBuffer, AVAudioTime,
};
use objc2_foundation::{NSError, NSLocale, NSString};
use objc2_speech::{
    SFSpeechAudioBufferRecognitionRequest, SFSpeechRecognitionResult, SFSpeechRecognitionTask,
    SFSpeechRecognizer, SFSpeechRecognizerAuthorizationStatus,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

const BUS: AVAudioNodeBus = 0;
/// 4096 frames is ~85ms at 48kHz: small enough to feel live, big enough to keep
/// the audio thread out of the recogniser's way.
const TAP_BUFFER_FRAMES: u32 = 4096;
/// A recogniser that keeps erroring without ever producing text is broken, not
/// just hitting the per-task audio limit. Give up rather than spin forever.
const MAX_ERROR_RESTARTS: u32 = 5;
/// If `endAudio` never yields a final result, drop the session anyway.
const STOP_GRACE: Duration = Duration::from_secs(5);

pub const EVT_STATE: &str = "speech://state";
pub const EVT_PARTIAL: &str = "speech://partial";
pub const EVT_FINAL: &str = "speech://final";
pub const EVT_ERROR: &str = "speech://error";

/// True between `speech_start` and `speech_stop`. Drives whether a finalised
/// task means "next segment" or "we're done".
static ACTIVE: AtomicBool = AtomicBool::new(false);
/// Bumped on every restart and teardown so callbacks from a retired task can
/// recognise themselves as stale and return without touching anything.
static GENERATION: AtomicU64 = AtomicU64::new(0);
static ERROR_RESTARTS: AtomicU32 = AtomicU32::new(0);

thread_local! {
    static SESSION: RefCell<Option<Session>> = const { RefCell::new(None) };
}

/// The live objects behind one dictation. `request`, `task` and `tap` are
/// replaced on every segment restart; `engine` and `recognizer` outlive them.
struct Session {
    engine: Retained<AVAudioEngine>,
    input_node: Retained<AVAudioInputNode>,
    recognizer: Retained<SFSpeechRecognizer>,
    request: Retained<SFSpeechAudioBufferRecognitionRequest>,
    task: Retained<SFSpeechRecognitionTask>,
    /// Held only to keep the block alive for as long as the tap references it.
    _tap: RcBlock<dyn Fn(NonNull<AVAudioPCMBuffer>, NonNull<AVAudioTime>)>,
}

struct Segment {
    request: Retained<SFSpeechAudioBufferRecognitionRequest>,
    task: Retained<SFSpeechRecognitionTask>,
    tap: RcBlock<dyn Fn(NonNull<AVAudioPCMBuffer>, NonNull<AVAudioTime>)>,
}

// ---------- payloads ----------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Permissions {
    speech: &'static str,
    microphone: &'static str,
}

#[derive(Serialize, Clone)]
struct StatePayload {
    state: &'static str,
}

#[derive(Serialize, Clone)]
struct TextPayload {
    text: String,
}

#[derive(Serialize, Clone)]
struct ErrorPayload {
    kind: &'static str,
    message: String,
}

fn emit_state(app: &AppHandle, state: &'static str) {
    let _ = app.emit(EVT_STATE, StatePayload { state });
}

fn emit_error(app: &AppHandle, kind: &'static str, message: impl Into<String>) {
    let _ = app.emit(
        EVT_ERROR,
        ErrorPayload {
            kind,
            message: message.into(),
        },
    );
}

// ---------- permissions ----------

fn speech_auth() -> &'static str {
    let status = unsafe { SFSpeechRecognizer::authorizationStatus() };
    match status {
        SFSpeechRecognizerAuthorizationStatus::Authorized => "granted",
        SFSpeechRecognizerAuthorizationStatus::Denied => "denied",
        SFSpeechRecognizerAuthorizationStatus::Restricted => "restricted",
        _ => "undetermined",
    }
}

fn mic_auth() -> &'static str {
    let Some(media) = (unsafe { AVMediaTypeAudio }) else {
        return "undetermined";
    };
    let status = unsafe { AVCaptureDevice::authorizationStatusForMediaType(media) };
    match status {
        AVAuthorizationStatus::Authorized => "granted",
        AVAuthorizationStatus::Denied => "denied",
        AVAuthorizationStatus::Restricted => "restricted",
        _ => "undetermined",
    }
}

#[tauri::command]
pub fn speech_permissions() -> Permissions {
    Permissions {
        speech: speech_auth(),
        microphone: mic_auth(),
    }
}

/// Shows the two macOS prompts in sequence. Both callbacks land on arbitrary
/// queues, so this waits on channels from a blocking task rather than holding
/// up an async runtime thread.
#[tauri::command]
pub async fn speech_request_permissions() -> Permissions {
    let handle = tauri::async_runtime::spawn_blocking(|| {
        if speech_auth() == "undetermined" {
            let (tx, rx) = std::sync::mpsc::channel();
            let block = RcBlock::new(move |status: SFSpeechRecognizerAuthorizationStatus| {
                let _ = tx.send(status);
            });
            unsafe { SFSpeechRecognizer::requestAuthorization(&block) };
            let _ = rx.recv_timeout(Duration::from_secs(120));
        }

        if mic_auth() == "undetermined" {
            if let Some(media) = unsafe { AVMediaTypeAudio } {
                let (tx, rx) = std::sync::mpsc::channel();
                let block = RcBlock::new(move |granted: Bool| {
                    let _ = tx.send(granted.as_bool());
                });
                unsafe {
                    AVCaptureDevice::requestAccessForMediaType_completionHandler(media, &block)
                };
                let _ = rx.recv_timeout(Duration::from_secs(120));
            }
        }

        speech_permissions()
    });

    handle.await.unwrap_or(Permissions {
        speech: "undetermined",
        microphone: "undetermined",
    })
}

/// Reports which of the requested locales this Mac can actually transcribe
/// offline, so the UI can hide or flag a language instead of failing on click.
#[tauri::command]
pub fn speech_supported_locales(locales: Vec<String>) -> Vec<String> {
    locales
        .into_iter()
        .filter(|id| {
            let ns = NSString::from_str(id);
            let locale = NSLocale::initWithLocaleIdentifier(NSLocale::alloc(), &ns);
            let recognizer =
                unsafe { SFSpeechRecognizer::initWithLocale(SFSpeechRecognizer::alloc(), &locale) };
            recognizer
                .map(|r| unsafe { r.supportsOnDeviceRecognition() })
                .unwrap_or(false)
        })
        .collect()
}

// ---------- session lifecycle ----------

#[tauri::command]
pub fn speech_start(app: AppHandle, locale: String) {
    if speech_auth() != "granted" {
        emit_error(
            &app,
            "permission-speech",
            "Spraakherkenning heeft geen toestemming.",
        );
        return;
    }
    if mic_auth() != "granted" {
        emit_error(
            &app,
            "permission-microphone",
            "De microfoon heeft geen toestemming.",
        );
        return;
    }

    let app_for_main = app.clone();
    let _ = app.run_on_main_thread(move || start_on_main(&app_for_main, &locale));
}

#[tauri::command]
pub fn speech_stop(app: AppHandle) {
    if !ACTIVE.swap(false, Ordering::SeqCst) {
        return;
    }
    emit_state(&app, "stopping");

    let _ = app.run_on_main_thread(move || {
        SESSION.with(|cell| {
            if let Some(session) = cell.borrow().as_ref() {
                unsafe {
                    session.input_node.removeTapOnBus(BUS);
                    session.engine.stop();
                    // Yields one last final result, which is where teardown happens.
                    session.request.endAudio();
                }
            }
        });
    });

    // Safety net: without a final result nothing else would ever release the
    // engine, and the mic indicator would stay lit.
    let app_for_grace = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(STOP_GRACE);
        if !ACTIVE.load(Ordering::SeqCst) {
            schedule_teardown(&app_for_grace);
        }
    });
}

fn start_on_main(app: &AppHandle, locale_id: &str) {
    teardown(app, false);

    let ns_locale = NSString::from_str(locale_id);
    let locale = NSLocale::initWithLocaleIdentifier(NSLocale::alloc(), &ns_locale);
    let Some(recognizer) =
        (unsafe { SFSpeechRecognizer::initWithLocale(SFSpeechRecognizer::alloc(), &locale) })
    else {
        emit_error(
            app,
            "locale-unavailable",
            format!("macOS kent geen spraakherkenning voor {locale_id}."),
        );
        return;
    };

    if !unsafe { recognizer.isAvailable() } {
        emit_error(
            app,
            "locale-unavailable",
            "De spraakherkenner is nu niet beschikbaar.",
        );
        return;
    }
    if !unsafe { recognizer.supportsOnDeviceRecognition() } {
        emit_error(
            app,
            "on-device-unavailable",
            format!("{locale_id} staat niet offline op deze Mac."),
        );
        return;
    }

    let engine = unsafe { AVAudioEngine::new() };
    let input_node = unsafe { engine.inputNode() };
    let format = unsafe { input_node.outputFormatForBus(BUS) };
    // A denied or absent microphone shows up as a zero format, and installing a
    // tap on one raises an Objective-C exception that would take the app down.
    if unsafe { format.sampleRate() } <= 0.0 || unsafe { format.channelCount() } == 0 {
        emit_error(
            app,
            "audio",
            "Geen bruikbare microfoon gevonden. Controleer je invoerapparaat.",
        );
        return;
    }

    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    ERROR_RESTARTS.store(0, Ordering::SeqCst);
    let segment = build_segment(app, &recognizer, &input_node, generation);

    unsafe { engine.prepare() };
    if let Err(err) = unsafe { engine.startAndReturnError() } {
        // The task from build_segment is already live and would report its own
        // failure on top of this one, so retire its generation before speaking.
        GENERATION.fetch_add(1, Ordering::SeqCst);
        unsafe {
            input_node.removeTapOnBus(BUS);
            segment.request.endAudio();
            segment.task.cancel();
        }
        emit_error(app, "audio", err.localizedDescription().to_string());
        return;
    }

    SESSION.with(|cell| {
        *cell.borrow_mut() = Some(Session {
            engine,
            input_node,
            recognizer,
            request: segment.request,
            task: segment.task,
            _tap: segment.tap,
        });
    });

    ACTIVE.store(true, Ordering::SeqCst);
    emit_state(app, "listening");
}

/// Builds a request/task/tap trio and installs the tap. The caller owns starting
/// the engine; on a restart the engine is already running.
fn build_segment(
    app: &AppHandle,
    recognizer: &SFSpeechRecognizer,
    input_node: &AVAudioInputNode,
    generation: u64,
) -> Segment {
    let request = unsafe { SFSpeechAudioBufferRecognitionRequest::new() };
    unsafe {
        request.setShouldReportPartialResults(true);
        request.setRequiresOnDeviceRecognition(true);
    }
    // Automatic punctuation only exists from macOS 13, and Doova still supports
    // 12. Calling the setter there would be an unrecognised selector, which is a
    // crash rather than an error, so it is asked for instead of assumed.
    if request.respondsToSelector(sel!(setAddsPunctuation:)) {
        unsafe { request.setAddsPunctuation(true) };
    }

    let handler_app = app.clone();
    let handler: RcBlock<dyn Fn(*mut SFSpeechRecognitionResult, *mut NSError)> =
        RcBlock::new(move |result: *mut SFSpeechRecognitionResult, error: *mut NSError| {
            on_result(&handler_app, generation, result, error);
        });
    let task = unsafe {
        recognizer.recognitionTaskWithRequest_resultHandler(
            &request,
            &handler as &DynBlock<dyn Fn(*mut SFSpeechRecognitionResult, *mut NSError)>,
        )
    };

    let tap_request = request.clone();
    let tap: RcBlock<dyn Fn(NonNull<AVAudioPCMBuffer>, NonNull<AVAudioTime>)> = RcBlock::new(
        move |buffer: NonNull<AVAudioPCMBuffer>, _when: NonNull<AVAudioTime>| unsafe {
            tap_request.appendAudioPCMBuffer(buffer.as_ref());
        },
    );

    let format = unsafe { input_node.outputFormatForBus(BUS) };
    unsafe {
        input_node.installTapOnBus_bufferSize_format_block(
            BUS,
            TAP_BUFFER_FRAMES,
            Some(&format),
            &*tap as *const DynBlock<_> as *mut _,
        );
    }

    Segment { request, task, tap }
}

/// Runs on whatever queue the recogniser picked, so it may only touch atomics
/// and `emit`; anything involving the session is bounced to the main thread.
fn on_result(
    app: &AppHandle,
    generation: u64,
    result: *mut SFSpeechRecognitionResult,
    error: *mut NSError,
) {
    if GENERATION.load(Ordering::SeqCst) != generation {
        return;
    }

    if !result.is_null() {
        let result = unsafe { &*result };
        let text = unsafe { result.bestTranscription().formattedString() }.to_string();
        let is_final = unsafe { result.isFinal() };

        if !text.trim().is_empty() {
            ERROR_RESTARTS.store(0, Ordering::SeqCst);
        }

        if !is_final {
            let _ = app.emit(EVT_PARTIAL, TextPayload { text });
            return;
        }

        let _ = app.emit(EVT_FINAL, TextPayload { text });
        if ACTIVE.load(Ordering::SeqCst) {
            schedule_restart(app);
        } else {
            schedule_teardown(app);
        }
        return;
    }

    if error.is_null() {
        return;
    }
    let err = unsafe { &*error };
    let message = err.localizedDescription().to_string();
    let code = err.code();

    // Silence and the per-task audio limit both surface as errors. While the
    // user is still dictating those mean "start the next segment", not "fail".
    if ACTIVE.load(Ordering::SeqCst)
        && ERROR_RESTARTS.fetch_add(1, Ordering::SeqCst) < MAX_ERROR_RESTARTS
    {
        schedule_restart(app);
        return;
    }

    ACTIVE.store(false, Ordering::SeqCst);
    emit_error(app, "recognition", format!("{message} (code {code})"));
    schedule_teardown(app);
}

fn schedule_restart(app: &AppHandle) {
    let app = app.clone();
    let app_for_main = app.clone();
    let _ = app.run_on_main_thread(move || restart_segment(&app_for_main));
}

fn schedule_teardown(app: &AppHandle) {
    let app = app.clone();
    let app_for_main = app.clone();
    let _ = app.run_on_main_thread(move || teardown(&app_for_main, true));
}

/// Swaps in a fresh request/task/tap while the engine keeps running, so the gap
/// between two segments is a few milliseconds rather than a restart.
fn restart_segment(app: &AppHandle) {
    if !ACTIVE.load(Ordering::SeqCst) {
        return;
    }

    let Some((recognizer, input_node)) = SESSION.with(|cell| {
        cell.borrow().as_ref().map(|s| {
            (s.recognizer.clone(), s.input_node.clone())
        })
    }) else {
        return;
    };

    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    unsafe {
        input_node.removeTapOnBus(BUS);
    }
    SESSION.with(|cell| {
        if let Some(session) = cell.borrow().as_ref() {
            unsafe {
                session.request.endAudio();
                session.task.cancel();
            }
        }
    });

    let segment = build_segment(app, &recognizer, &input_node, generation);
    SESSION.with(|cell| {
        if let Some(session) = cell.borrow_mut().as_mut() {
            session.request = segment.request;
            session.task = segment.task;
            session._tap = segment.tap;
        }
    });
}

/// Idempotent: the stop grace timer and a final result both call it.
fn teardown(app: &AppHandle, announce: bool) {
    GENERATION.fetch_add(1, Ordering::SeqCst);
    ACTIVE.store(false, Ordering::SeqCst);

    let had_session = SESSION.with(|cell| {
        let taken = cell.borrow_mut().take();
        match taken {
            Some(session) => {
                unsafe {
                    session.input_node.removeTapOnBus(BUS);
                    session.engine.stop();
                    session.request.endAudio();
                    session.task.cancel();
                }
                true
            }
            None => false,
        }
    });

    if announce && had_session {
        emit_state(app, "idle");
    }
}
