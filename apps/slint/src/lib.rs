//! FitMentor Slint Android spike.
//!
//! The UI is a native Slint window. On Android it runs through
//! `android-activity`; on desktop `main.rs` runs the same window.

use slint::ComponentHandle;
use std::env;
use std::time::{Duration, Instant};

slint::include_modules!();

pub mod api;

fn apply_log(ui: &AppWindow, log: &api::TodayLog) {
    ui.set_water(log.water as i32);
    ui.set_sleep(log.sleep as i32);
    ui.set_steps(log.steps as i32);
    ui.set_protein(log.protein_g as i32);
}

fn finish_google_error(handle: &slint::Weak<AppWindow>, message: &str) {
    let handle = handle.clone();
    let message = message.to_string();
    slint::invoke_from_event_loop(move || {
        if let Some(ui) = handle.upgrade() {
            ui.set_google_busy(false);
            ui.set_auth_status("".into());
            ui.set_auth_error(message.into());
        }
    })
    .ok();
}

pub fn create_window() -> Result<AppWindow, slint::PlatformError> {
    let ui = AppWindow::new()?;
    ui.set_user_name(
        env::var("FITMENTOR_USER_NAME")
            .unwrap_or_else(|_| "Friend".into())
            .into(),
    );

    let initial_token = env::var("FITMENTOR_JWT").ok().or_else(api::load_token);
    if let Some(token) = initial_token {
        api::set_token(Some(token));
        ui.set_signed_in(true);
        ui.set_status_text("Signed in".into());
    }

    let handle = ui.as_weak();
    ui.on_sign_in(move || {
        let Some(ui) = handle.upgrade() else {
            return;
        };
        let token = ui.get_auth_token().trim().to_string();
        if token.is_empty() {
            ui.set_auth_error("Paste a mobile token first.".into());
            return;
        }
        ui.set_auth_error("".into());
        let handle = handle.clone();
        std::thread::spawn(move || {
            let result = api::fetch_me(&token);
            let handle = handle.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = handle.upgrade() {
                    match result {
                        Ok(user) => {
                            api::set_token(Some(token));
                            ui.set_signed_in(true);
                            ui.set_user_name(user.name.into());
                            ui.set_status_text("Signed in".into());
                            ui.invoke_refresh();
                            ui.invoke_load_profile();
                        }
                        Err(error) => ui.set_auth_error(error.into()),
                    }
                }
            })
            .ok();
        });
    });

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
    ui.on_load_profile(move || {
        let handle = handle.clone();
        std::thread::spawn(move || {
            let result = api::fetch_profile();
            let handle = handle.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = handle.upgrade() {
                    if let Ok(profile) = result {
                        let tier = match profile.tier.as_str() {
                            "pro" => "Basic",
                            "premium" => "Elite",
                            _ => "Free",
                        };
                        let name = profile.name;
                        ui.set_user_name(name.clone().into());
                        ui.set_profile_name(name.into());
                        ui.set_profile_email(profile.email.into());
                        ui.set_profile_age(profile.age as i32);
                        ui.set_profile_height(profile.height_cm as i32);
                        ui.set_profile_weight(profile.weight_kg as i32);
                        ui.set_profile_goal(profile.goal.into());
                        ui.set_profile_diet(profile.diet.into());
                        ui.set_profile_place(profile.place.into());
                        ui.set_profile_experience(profile.experience.into());
                        ui.set_profile_days(profile.days_per_week as i32);
                        ui.set_profile_budget(profile.budget_per_day as i32);
                        ui.set_profile_tier(tier.into());
                    }
                }
            })
            .ok();
        });
    });

    let handle = ui.as_weak();
    ui.on_sign_out(move || {
        if let Some(ui) = handle.upgrade() {
            api::set_token(None);
            ui.set_signed_in(false);
            ui.set_auth_token("".into());
            ui.set_auth_error("".into());
            ui.set_user_name("Friend".into());
            ui.set_profile_name("Friend".into());
            ui.set_profile_email("".into());
            ui.set_profile_tier("Free".into());
            ui.set_status_text("Connect your account to sync today's log.".into());
            ui.set_tab(0);
        }
    });

    let handle = ui.as_weak();
    ui.on_set_tab(move |tab| {
        if let Some(ui) = handle.upgrade() {
            ui.set_tab(tab);
            if tab == 4 {
                ui.invoke_load_profile();
            }
        }
    });

    let handle = ui.as_weak();
    ui.on_google_sign_in(move || {
        let Some(ui) = handle.upgrade() else {
            return;
        };
        if ui.get_google_busy() {
            return;
        }
        ui.set_google_busy(true);
        ui.set_auth_error("".into());
        ui.set_auth_status("Starting Google sign-in...".into());
        let handle = handle.clone();
        std::thread::spawn(move || {
            let client_id = api::google_client_id();
            if client_id.is_empty() {
                finish_google_error(
                    &handle,
                    "Google Sign-In is not configured. Set FITMENTOR_GOOGLE_CLIENT_ID.",
                );
                return;
            }
            let device = match api::device_start(&client_id) {
                Ok(device) => device,
                Err(error) => {
                    finish_google_error(&handle, &error);
                    return;
                }
            };

            let ui_handle = handle.clone();
            let code = device.user_code.clone();
            let url = device.verification_url.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = ui_handle.upgrade() {
                    ui.set_device_user_code(code.into());
                    ui.set_device_url(url.into());
                    ui.set_auth_status("Approve the code in your browser...".into());
                }
            })
            .ok();

            let interval = device.interval.max(5) as u64;
            let deadline = Instant::now() + Duration::from_secs(device.expires_in.max(60) as u64);
            loop {
                if Instant::now() > deadline {
                    finish_google_error(&handle, "Google sign-in timed out.");
                    return;
                }
                std::thread::sleep(Duration::from_secs(interval));
                match api::device_poll(&client_id, &device.device_code) {
                    Ok(Some(id_token)) => match api::exchange_google(&id_token) {
                        Ok((token, user)) => {
                            api::set_token(Some(token));
                            let ui_handle = handle.clone();
                            slint::invoke_from_event_loop(move || {
                                if let Some(ui) = ui_handle.upgrade() {
                                    ui.set_signed_in(true);
                                    ui.set_user_name(user.name.into());
                                    ui.set_status_text("Signed in with Google".into());
                                    ui.set_google_busy(false);
                                    ui.set_device_user_code("".into());
                                    ui.set_device_url("".into());
                                    ui.set_auth_status("".into());
                                    ui.invoke_refresh();
                                    ui.invoke_load_profile();
                                }
                            })
                            .ok();
                            return;
                        }
                        Err(error) => {
                            finish_google_error(&handle, &error);
                            return;
                        }
                    },
                    Ok(None) => {}
                    Err(error) => {
                        finish_google_error(&handle, &error);
                        return;
                    }
                }
            }
        });
    });

    ui.invoke_refresh();
    if ui.get_signed_in() {
        ui.invoke_load_profile();
    }
    Ok(ui)
}

#[cfg(target_os = "android")]
#[no_mangle]
fn android_main(app: slint::android::AndroidApp) {
    if let Some(dir) = app.internal_data_path() {
        api::set_storage_dir(dir);
    }
    slint::android::init(app).unwrap();
    let ui = create_window().unwrap();
    ui.run().unwrap();
}
