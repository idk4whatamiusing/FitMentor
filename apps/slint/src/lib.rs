//! FitMentor Slint Android spike.
//!
//! The UI is a native Slint window. On Android it runs through
//! `android-activity`; on desktop `main.rs` runs the same window.

use slint::ComponentHandle;
use std::env;

slint::include_modules!();

pub mod api;

fn apply_log(ui: &AppWindow, log: &api::TodayLog) {
    ui.set_water(log.water as i32);
    ui.set_sleep(log.sleep as i32);
    ui.set_steps(log.steps as i32);
    ui.set_protein(log.protein_g as i32);
}

pub fn create_window() -> Result<AppWindow, slint::PlatformError> {
    let ui = AppWindow::new()?;
    ui.set_user_name(
        env::var("FITMENTOR_USER_NAME")
            .unwrap_or_else(|_| "Friend".into())
            .into(),
    );

    let handle = ui.as_weak();
    ui.on_refresh(move || {
        if let Some(ui) = handle.upgrade() {
            ui.set_loading(true);
            ui.set_status_text("Syncing...".into());
        }
        let handle = handle.clone();
        std::thread::spawn(move || {
            let result = api::fetch_today();
            let handle = handle.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = handle.upgrade() {
                    ui.set_loading(false);
                    match result {
                        Ok(log) => {
                            apply_log(&ui, &log);
                            ui.set_status_text("Synced just now".into());
                        }
                        Err(error) => ui.set_status_text(error.into()),
                    }
                }
            })
            .ok();
        });
    });

    let handle = ui.as_weak();
    ui.on_add_water(move || {
        if let Some(ui) = handle.upgrade() {
            ui.set_water(ui.get_water() + 1);
        }
    });

    let handle = ui.as_weak();
    ui.on_add_steps(move || {
        if let Some(ui) = handle.upgrade() {
            ui.set_steps(ui.get_steps() + 1000);
        }
    });

    let handle = ui.as_weak();
    ui.on_add_protein(move || {
        if let Some(ui) = handle.upgrade() {
            ui.set_protein(ui.get_protein() + 10);
        }
    });

    let handle = ui.as_weak();
    ui.on_set_tab(move |tab| {
        if let Some(ui) = handle.upgrade() {
            ui.set_tab(tab);
        }
    });

    ui.invoke_refresh();
    Ok(ui)
}

#[cfg(target_os = "android")]
#[no_mangle]
fn android_main(app: slint::android::AndroidApp) {
    slint::android::init(app).unwrap();
    let ui = create_window().unwrap();
    ui.run().unwrap();
}
