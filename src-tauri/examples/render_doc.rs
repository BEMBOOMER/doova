//! Runs the document converter outside the app, because AppKit needs the real
//! main thread and a test-harness thread will not do. Kept so the PDF and Word
//! output can be eyeballed without clicking through the UI.
//!
//!   cargo run --example render_doc -- input.html pdf out.pdf
fn main() {
    let mut args = std::env::args().skip(1);
    let input = args.next().expect("input.html");
    let format = args.next().expect("pdf | docx");
    let output = args.next().expect("output path");

    let html = std::fs::read_to_string(&input).expect("kon de HTML niet lezen");
    match doova_lib::docexport::render(&html, &format) {
        Ok(bytes) => {
            std::fs::write(&output, &bytes).expect("kon niet schrijven");
            println!("{} bytes naar {output}", bytes.len());
        }
        Err(err) => {
            eprintln!("mislukt: {err}");
            std::process::exit(1);
        }
    }
}
