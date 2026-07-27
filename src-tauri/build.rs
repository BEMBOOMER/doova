fn main() {
    // `tauri dev` runs the bare binary, not a .app, so the bundled Info.plist is
    // not there yet. macOS kills any process that touches the microphone without
    // a usage description, so the same plist is linked into the executable as an
    // __info_plist section. A real bundle keeps using the file on disk.
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rerun-if-changed=Info.plist");
        match std::path::Path::new("Info.plist").canonicalize() {
            Ok(path) => println!(
                "cargo:rustc-link-arg-bins=-Wl,-sectcreate,__TEXT,__info_plist,{}",
                path.display()
            ),
            Err(err) => println!("cargo:warning=Info.plist not embedded: {err}"),
        }
    }

    tauri_build::build()
}
