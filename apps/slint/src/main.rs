// Prevent console window in addition to Slint window in Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use slint::ComponentHandle;

fn main() -> Result<(), slint::PlatformError> {
    // Headless smoke check used by CI/dev: `fitmentor-slint --check-api`.
    if std::env::args().any(|arg| arg == "--check-api") {
        if let Some(token) = std::env::var("FITMENTOR_JWT")
            .ok()
            .or_else(fitmentor_slint::api::load_token)
        {
            fitmentor_slint::api::set_token(Some(token));
        }
        match fitmentor_slint::api::fetch_today() {
            Ok(log) => println!("{log:?}"),
            Err(error) => {
                eprintln!("{error}");
                std::process::exit(1);
            }
        }
        return Ok(());
    }

    if std::env::args().any(|arg| arg == "--check-profile") {
        if let Some(token) = std::env::var("FITMENTOR_JWT")
            .ok()
            .or_else(fitmentor_slint::api::load_token)
        {
            fitmentor_slint::api::set_token(Some(token));
        }
        match fitmentor_slint::api::fetch_profile() {
            Ok(profile) => println!("{profile:?}"),
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
