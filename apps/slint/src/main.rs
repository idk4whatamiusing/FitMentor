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

    if std::env::args().any(|arg| arg == "--check-chat") {
        if let Some(token) = std::env::var("FITMENTOR_JWT")
            .ok()
            .or_else(fitmentor_slint::api::load_token)
        {
            fitmentor_slint::api::set_token(Some(token));
        }
        match fitmentor_slint::api::fetch_coach_session() {
            Ok(session) => {
                println!("session: {}", session.id);
                for message in session.messages.iter().rev().take(6).rev() {
                    println!("{}: {}", message.role, message.content);
                }
            }
            Err(error) => {
                eprintln!("{error}");
                std::process::exit(1);
            }
        }
        return Ok(());
    }

    if std::env::args().any(|arg| arg == "--check-workout") {
        if let Some(token) = std::env::var("FITMENTOR_JWT")
            .ok()
            .or_else(fitmentor_slint::api::load_token)
        {
            fitmentor_slint::api::set_token(Some(token));
        }
        match fitmentor_slint::api::fetch_workout() {
            Ok(days) => {
                for day in days {
                    println!(
                        "{} | {} | completed={} | {}",
                        day.day_index, day.title, day.completed, day.focus
                    );
                    println!("{}", day.summary);
                }
            }
            Err(error) => {
                eprintln!("{error}");
                std::process::exit(1);
            }
        }
        return Ok(());
    }

    if std::env::args().any(|arg| arg == "--check-nutrition") {
        if let Some(token) = std::env::var("FITMENTOR_JWT")
            .ok()
            .or_else(fitmentor_slint::api::load_token)
        {
            fitmentor_slint::api::set_token(Some(token));
        }
        match fitmentor_slint::api::fetch_profile() {
            Ok(profile) => println!(
                "targets: {:?}",
                fitmentor_slint::api::calc_targets(&profile)
            ),
            Err(error) => eprintln!("profile: {error}"),
        }
        match fitmentor_slint::api::fetch_meal_plan() {
            Ok(plan) => println!("meal plan: {plan:?}"),
            Err(error) => eprintln!("meal plan: {error}"),
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
