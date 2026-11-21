// Prevent console window in addition to Slint window in Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use slint::ComponentHandle;

fn main() -> Result<(), slint::PlatformError> {
    // Headless smoke check used by CI/dev: `fitmentor-slint --check-api`.
    if std::env::args().any(|arg| arg == "--check-api") {
        match fitmentor_slint::api::fetch_today() {
            Ok(log) => println!("{log:?}"),
            Err(error) => {
                eprintln!("{error}");
                std::process::exit(1);
            }
        }
        return Ok(());
    }

    let ui = fitmentor_slint::create_window()?;
    ui.run()
}
