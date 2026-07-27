//! Turns a block's HTML into a PDF or a Word document.
//!
//! Both go through `NSAttributedString`, which reads HTML and writes Office Open
//! XML directly. PDF has no such writer, so the string is laid out in an
//! offscreen `NSTextView` and printed through `NSPrintOperation`, which is what
//! gives it pagination.
//!
//! AppKit is main-thread only, so the work is handed to the main thread and the
//! result comes back over a channel.

use std::sync::mpsc;

use objc2::rc::{autoreleasepool, Retained};
use objc2::{AllocAnyThread, MainThreadMarker, MainThreadOnly};
use objc2::runtime::AnyObject;
use objc2_app_kit::{
    NSAttributedStringDocumentAttributeKey, NSAttributedStringDocumentFormats,
    NSAttributedStringDocumentReadingOptionKey, NSAttributedStringDocumentType,
    NSDocumentTypeDocumentAttribute, NSDocumentTypeDocumentOption, NSHTMLTextDocumentType,
    NSMutableParagraphStyle, NSOfficeOpenXMLTextDocumentType, NSParagraphStyle,
    NSParagraphStyleAttributeName, NSPrintInfo, NSPrintOperation, NSTextView,
};
use objc2_foundation::{
    NSArray, NSAttributedString, NSAttributedStringKey, NSData, NSDictionary, NSError,
    NSMutableAttributedString, NSMutableData, NSPoint, NSRange, NSRect, NSSize,
};
use tauri::AppHandle;

/// A4 at 72dpi, with a margin that leaves a comfortable measure for body text.
const PAGE: NSSize = NSSize {
    width: 595.0,
    height: 842.0,
};
const MARGIN: f64 = 48.0;

#[tauri::command]
pub async fn export_document(
    app: AppHandle,
    html: String,
    path: String,
    format: String,
) -> Result<(), String> {
    let (tx, rx) = mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(render(&html, &format));
    })
    .map_err(|err| format!("Kon de hoofdthread niet bereiken: {err}"))?;

    let bytes = rx
        .recv()
        .map_err(|_| "De omzetting is halverwege afgebroken.".to_string())??;

    std::fs::write(&path, bytes).map_err(|err| format!("Opslaan mislukt: {err}"))
}

pub fn render(html: &str, format: &str) -> Result<Vec<u8>, String> {
    let mtm = MainThreadMarker::new().ok_or("Niet op de hoofdthread.")?;
    autoreleasepool(|_| {
        let attributed = parse_html(html)?;
        match format {
            "pdf" => to_pdf(&attributed, mtm),
            "docx" => to_docx(&attributed),
            other => Err(format!("Onbekend formaat: {other}")),
        }
    })
}

/// The document-type constants are `NSString`s while both attribute dictionaries
/// are typed as holding `AnyObject`, so the value needs widening on the way in.
/// Reading and writing use differently typed keys for the same idea.
fn reading_options(
    document_type: &'static NSAttributedStringDocumentType,
) -> Retained<NSDictionary<NSAttributedStringDocumentReadingOptionKey, AnyObject>> {
    let value: &AnyObject = &**document_type;
    NSDictionary::from_slices(&[unsafe { NSDocumentTypeDocumentOption }], &[value])
}

fn writing_options(
    document_type: &'static NSAttributedStringDocumentType,
) -> Retained<NSDictionary<NSAttributedStringDocumentAttributeKey, AnyObject>> {
    let value: &AnyObject = &**document_type;
    NSDictionary::from_slices(&[unsafe { NSDocumentTypeDocumentAttribute }], &[value])
}

fn parse_html(html: &str) -> Result<Retained<NSMutableAttributedString>, String> {
    let data = NSData::with_bytes(html.as_bytes());
    let options = reading_options(unsafe { NSHTMLTextDocumentType });
    // Only the immutable class carries the HTML reader, so the mutable copy that
    // strip_text_lists needs is made afterwards.
    let parsed = unsafe {
        NSAttributedString::initWithData_options_documentAttributes_error(
            NSAttributedString::alloc(),
            &data,
            &options,
            None,
        )
    }
    .map_err(|err| format!("Kon de inhoud niet lezen: {}", err.localized()))?;

    let attributed = NSMutableAttributedString::from_attributed_nsstring(&parsed);
    strip_text_lists(&attributed);
    Ok(attributed)
}

/// The importer records a list both as a bullet in the text and as a text list
/// on the paragraph style. Word honours only the text, but NSTextView draws
/// both, so every bullet would appear twice in the PDF. The paragraph's copy is
/// the one to drop.
fn strip_text_lists(attributed: &NSMutableAttributedString) {
    let key: &NSAttributedStringKey = unsafe { NSParagraphStyleAttributeName };
    let len = attributed.length();
    let mut index = 0usize;

    while index < len {
        let mut effective = NSRange::new(0, 0);
        let value = unsafe {
            attributed.attribute_atIndex_effectiveRange(key, index, &mut effective)
        };
        let next = effective.location + effective.length;

        if let Some(value) = value {
            if let Ok(style) = value.downcast::<NSParagraphStyle>() {
                if !style.textLists().is_empty() {
                    let mutable = NSMutableParagraphStyle::new();
                    mutable.setParagraphStyle(&style);
                    mutable.setTextLists(&NSArray::new());
                    unsafe { attributed.addAttribute_value_range(key, &mutable, effective) };
                }
            }
        }

        index = if next > index { next } else { index + 1 };
    }
}

fn to_docx(attributed: &NSMutableAttributedString) -> Result<Vec<u8>, String> {
    let options = writing_options(unsafe { NSOfficeOpenXMLTextDocumentType });
    let range = NSRange::new(0, attributed.length());
    let data = unsafe {
        attributed.dataFromRange_documentAttributes_error(range, &options)
    }
    .map_err(|err| format!("Word-bestand maken mislukt: {}", err.localized()))?;
    Ok(data.to_vec())
}

fn to_pdf(
    attributed: &NSMutableAttributedString,
    mtm: MainThreadMarker,
) -> Result<Vec<u8>, String> {
    let text_frame = NSRect::new(
        NSPoint::new(0.0, 0.0),
        NSSize::new(PAGE.width - MARGIN * 2.0, PAGE.height - MARGIN * 2.0),
    );
    let view = NSTextView::initWithFrame(NSTextView::alloc(mtm), text_frame);
    unsafe {
        if let Some(storage) = view.textStorage() {
            storage.setAttributedString(attributed);
        }
        // Grow downwards so a long note becomes several pages instead of one
        // clipped page.
        view.setVerticallyResizable(true);
        view.sizeToFit();
    }

    let info = NSPrintInfo::sharedPrintInfo();
    info.setPaperSize(PAGE);
    info.setTopMargin(MARGIN);
    info.setBottomMargin(MARGIN);
    info.setLeftMargin(MARGIN);
    info.setRightMargin(MARGIN);

    let out = NSMutableData::new();
    let operation = NSPrintOperation::PDFOperationWithView_insideRect_toData_printInfo(
        &view,
        view.bounds(),
        &out,
        &info,
    );
    operation.setShowsPrintPanel(false);
    operation.setShowsProgressPanel(false);
    if !operation.runOperation() {
        return Err("macOS kon er geen PDF van maken.".into());
    }

    Ok(NSData::to_vec(&out))
}

trait Localized {
    fn localized(&self) -> String;
}

impl Localized for NSError {
    fn localized(&self) -> String {
        self.localizedDescription().to_string()
    }
}
