//! FitMentor native client (desktop + Android).
//!
//! The UI is a native Slint window. On Android it runs through
//! `android-activity`; on desktop `main.rs` runs the same window.

use slint::{ComponentHandle, Model, ModelRc, VecModel};
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

fn first_word(name: &str) -> String {
    name.split_whitespace()
        .next()
        .unwrap_or("Friend")
        .to_string()
}

fn friendly_session_title(title: &str, focus: &str) -> String {
    let focus = focus.to_lowercase();
    if focus.contains("chest") || focus.contains("shoulder") || focus.contains("tricep") {
        "Push Day".into()
    } else if focus.contains("back") || focus.contains("bicep") {
        "Pull Day".into()
    } else if focus.contains("quad") || focus.contains("hamstring") || focus.contains("glute") {
        "Leg Day".into()
    } else {
        title.to_string()
    }
}

fn apply_today_label(ui: &AppWindow) {
    let now = chrono::Local::now();
    ui.set_today_day(now.format("%-d").to_string().into());
    ui.set_today_label(now.format("%A, %-d %B").to_string().to_uppercase().into());
}

fn refresh_history(ui: &AppWindow) {
    let entries = api::last7()
        .into_iter()
        .map(|(date, log)| DayLog {
            date: date.into(),
            water: log.water as i32,
            sleep: log.sleep as i32,
            steps: log.steps as i32,
            protein: log.protein as i32,
            workout: log.workout,
            weight: log.weight as i32,
        })
        .collect::<Vec<_>>();
    let week_workouts = entries.iter().filter(|entry| entry.workout).count() as i32;
    let avg_protein = if entries.is_empty() {
        0
    } else {
        entries.iter().map(|entry| entry.protein).sum::<i32>() / entries.len() as i32
    };
    let avg_sleep = if entries.is_empty() {
        0.0
    } else {
        entries.iter().map(|entry| entry.sleep as f64).sum::<f64>() / entries.len() as f64
    };
    let weights = entries
        .iter()
        .enumerate()
        .filter(|(_, entry)| entry.weight > 0)
        .map(|(index, entry)| (index as f64, entry.weight as f64))
        .collect::<Vec<_>>();
    let weight_path = if weights.len() < 2 {
        String::new()
    } else {
        let min = weights
            .iter()
            .map(|(_, weight)| *weight)
            .fold(f64::INFINITY, f64::min);
        let max = weights
            .iter()
            .map(|(_, weight)| *weight)
            .fold(f64::NEG_INFINITY, f64::max);
        let span = (max - min).max(1.0);
        let points = weights
            .iter()
            .map(|(index, weight)| {
                let x = index / 6.0 * 310.0;
                let y = 130.0 - ((weight - min) / span * 120.0);
                (x, y)
            })
            .collect::<Vec<_>>();
        let mut commands = String::new();
        for (index, (x, y)) in points.iter().enumerate() {
            commands.push_str(if index == 0 { "M " } else { " L " });
            commands.push_str(&format!("{x:.1} {y:.1}"));
        }
        commands
    };

    ui.set_history(ModelRc::new(VecModel::from(entries)));
    ui.set_streak(api::compute_streak() as i32);
    ui.set_week_workouts(week_workouts);
    ui.set_avg_protein(avg_protein);
    ui.set_avg_sleep(format!("{avg_sleep:.1}").into());
    ui.set_weight_path(weight_path.into());
}

fn log_has_activity(log: &api::LogRecord) -> bool {
    log.water > 0
        || log.sleep > 0
        || log.steps > 0
        || log.protein > 0
        || log.workout
        || log.weight > 0
}

fn persist_today(
    ui: &AppWindow,
    water: Option<i64>,
    sleep: Option<i64>,
    steps: Option<i64>,
    protein: Option<i64>,
    workout: Option<bool>,
    weight: Option<i64>,
) {
    api::patch_today(water, sleep, steps, protein, workout, weight);
    if let Some(record) = api::load_logs().get(&api::today_key()).cloned() {
        if log_has_activity(&record) {
            std::thread::spawn(move || {
                let _ = api::upsert_today_log(&record);
            });
        }
    }
    refresh_history(ui);
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
    if let Some(dark) = api::load_theme_dark() {
        ui.set_dark_mode(dark);
    }
    if let Ok(theme) = env::var("FITMENTOR_THEME") {
        ui.set_dark_mode(theme.eq_ignore_ascii_case("dark"));
    }
    if env::var("FITMENTOR_ONBOARDING")
        .map(|v| v == "1")
        .unwrap_or(false)
    {
        ui.set_signed_in(true);
        ui.set_needs_onboarding(true);
        if let Ok(step) = env::var("FITMENTOR_STEP") {
            if let Ok(step) = step.parse::<i32>() {
                ui.set_onboarding_step(step.clamp(0, 8));
            }
        }
    }
    if env::var("FITMENTOR_PROGRESS")
        .map(|v| v == "1")
        .unwrap_or(false)
    {
        ui.set_show_progress(true);
    }
    if let Ok(tab) = env::var("FITMENTOR_TAB") {
        if let Ok(tab) = tab.parse::<i32>() {
            if (0..=5).contains(&tab) {
                ui.set_tab(tab);
            }
        }
    }
    ui.set_user_name(
        env::var("FITMENTOR_USER_NAME")
            .unwrap_or_else(|_| "Friend".into())
            .into(),
    );
    ui.set_first_name(first_word(&ui.get_user_name()).into());
    apply_today_label(&ui);
    refresh_history(&ui);

    let foods = vec![
        ("Roti (1)", 100, 3),
        ("Rice (1 cup)", 200, 4),
        ("Dal (1 katori)", 150, 9),
        ("Egg (1 whole)", 75, 6),
        ("Paneer (100g)", 260, 18),
        ("Milk (250ml)", 150, 8),
        ("Chicken breast (100g)", 165, 31),
        ("Fish (100g)", 130, 22),
        ("Soya chunks (50g dry)", 170, 26),
        ("Oats (50g)", 190, 7),
        ("Banana (1)", 100, 1),
        ("Peanut butter (1 tbsp)", 95, 4),
    ]
    .into_iter()
    .map(|(name, kcal, protein)| QuickFood {
        name: name.into(),
        kcal,
        protein,
    })
    .collect::<Vec<_>>();
    ui.set_quick_foods(ModelRc::new(VecModel::from(foods)));

    let exercises = vec![
        "Bench Press",
        "Back Squat",
        "Deadlift",
        "Pull-up",
        "Push-up",
        "Shoulder Press",
        "Barbell Row",
        "Walking Lunges",
        "Plank",
        "Lat Pulldown",
        "Bicep Curl",
        "Tricep Pushdown",
        "Leg Press",
        "Lateral Raise",
        "Romanian Deadlift",
        "Face Pull",
    ]
    .into_iter()
    .map(|name| name.into())
    .collect::<Vec<slint::SharedString>>();
    ui.set_exercise_names(ModelRc::new(VecModel::from(exercises)));

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
            let local = api::load_logs();
            let _ = api::sync_logs(&local);
            let today = api::today_key();
            let from = (chrono::Utc::now() - chrono::Duration::days(120))
                .format("%Y-%m-%d")
                .to_string();
            if let Ok(remote) = api::fetch_logs_range(&from, &today) {
                api::merge_logs(remote);
            }
            let result = api::fetch_today();
            let handle = handle.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = handle.upgrade() {
                    ui.set_loading(false);
                    match result {
                        Ok(log) => {
                            apply_log(&ui, &log);
                            persist_today(
                                &ui,
                                Some(log.water),
                                Some(log.sleep),
                                Some(log.steps),
                                Some(log.protein_g),
                                Some(log.workout_done),
                                log.weight_kg.map(|weight| weight.round() as i64),
                            );
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
            let water = ui.get_water() + 1;
            ui.set_water(water);
            persist_today(&ui, Some(water as i64), None, None, None, None, None);
        }
    });

    let handle = ui.as_weak();
    ui.on_add_steps(move || {
        if let Some(ui) = handle.upgrade() {
            let steps = ui.get_steps() + 1000;
            ui.set_steps(steps);
            persist_today(&ui, None, None, Some(steps as i64), None, None, None);
        }
    });

    let handle = ui.as_weak();
    ui.on_add_protein(move || {
        if let Some(ui) = handle.upgrade() {
            let protein = ui.get_protein() + 10;
            ui.set_protein(protein);
            persist_today(&ui, None, None, None, Some(protein as i64), None, None);
        }
    });

    let handle = ui.as_weak();
    ui.on_add_steps_by(move |amount| {
        if let Some(ui) = handle.upgrade() {
            let steps = (ui.get_steps() + amount).clamp(0, 50_000);
            ui.set_steps(steps);
            persist_today(&ui, None, None, Some(steps as i64), None, None, None);
        }
    });

    let handle = ui.as_weak();
    ui.on_add_protein_by(move |amount| {
        if let Some(ui) = handle.upgrade() {
            let protein = (ui.get_protein() + amount).max(0);
            ui.set_protein(protein);
            persist_today(&ui, None, None, None, Some(protein as i64), None, None);
        }
    });

    let handle = ui.as_weak();
    ui.on_log_sleep(move |hours| {
        if let Some(ui) = handle.upgrade() {
            ui.set_sleep(hours);
            persist_today(&ui, None, Some(hours as i64), None, None, None, None);
        }
    });

    let handle = ui.as_weak();
    ui.on_log_weight(move || {
        if let Some(ui) = handle.upgrade() {
            if let Ok(weight) = ui.get_weight_input().trim().parse::<i64>() {
                if weight > 0 {
                    persist_today(&ui, None, None, None, None, None, Some(weight));
                    ui.set_profile_weight(weight as i32);
                    ui.set_weight_input("".into());
                }
            }
        }
    });

    let handle = ui.as_weak();
    ui.on_open_progress(move || {
        if let Some(ui) = handle.upgrade() {
            refresh_history(&ui);
            ui.set_show_progress(true);
        }
    });

    let handle = ui.as_weak();
    ui.on_close_progress(move || {
        if let Some(ui) = handle.upgrade() {
            ui.set_show_progress(false);
        }
    });

    ui.on_open_report(move || {
        let _ = webbrowser::open("https://fitmentor-ey9.pages.dev/progress");
    });

    let handle = ui.as_weak();
    ui.on_run_tool(move || {
        let Some(ui) = handle.upgrade() else {
            return;
        };
        let path = match ui.get_tool() {
            0 => "/v1/tools/bmi-advice",
            1 => "/v1/tools/sleep-advice",
            3 => "/v1/tools/injury-advice",
            6 => "/v1/tools/form-advice",
            _ => return,
        };
        ui.set_tool_busy(true);
        ui.set_tool_advice("".into());
        let handle = handle.clone();
        std::thread::spawn(move || {
            let result = api::fetch_tool_advice(path);
            let handle = handle.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = handle.upgrade() {
                    ui.set_tool_busy(false);
                    match result {
                        Ok(tips) if !tips.is_empty() => ui.set_tool_advice(tips.join("\n").into()),
                        Ok(_) => ui.set_tool_advice(
                            "No advice available yet. Generate a plan first.".into(),
                        ),
                        Err(error) => ui.set_tool_advice(error.into()),
                    }
                }
            })
            .ok();
        });
    });

    let handle = ui.as_weak();
    ui.on_toggle_theme(move || {
        if let Some(ui) = handle.upgrade() {
            let next = !ui.get_dark_mode();
            ui.set_dark_mode(next);
            api::save_theme_dark(next);
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
                        let needs_onboarding = profile.name == "Friend";
                        if env::var("FITMENTOR_ONBOARDING")
                            .map(|v| v == "1")
                            .unwrap_or(false)
                        {
                            ui.set_needs_onboarding(true);
                        } else {
                            ui.set_needs_onboarding(needs_onboarding);
                        }
                        ui.set_form_name(if needs_onboarding {
                            "".into()
                        } else {
                            profile.name.clone().into()
                        });
                        ui.set_form_age(profile.age.to_string().into());
                        ui.set_form_gender(profile.gender.clone().into());
                        ui.set_form_height(profile.height_cm.to_string().into());
                        ui.set_form_weight(profile.weight_kg.to_string().into());
                        ui.set_form_goal(profile.goal.clone().into());
                        ui.set_form_place(profile.place.clone().into());
                        ui.set_form_experience(profile.experience.clone().into());
                        ui.set_form_diet(profile.diet.clone().into());
                        ui.set_form_days(profile.days_per_week.to_string().into());
                        ui.set_form_budget(profile.budget_per_day.to_string().into());
                        ui.set_form_days_num(profile.days_per_week as i32);
                        ui.set_form_budget_num(profile.budget_per_day as i32);
                        let name = profile.name;
                        ui.set_first_name(first_word(&name).into());
                        ui.set_user_name(name.clone().into());
                        ui.set_profile_name(name.into());
                        ui.set_profile_email(profile.email.into());
                        ui.set_profile_age(profile.age as i32);
                        ui.set_profile_height(profile.height_cm as i32);
                        ui.set_profile_weight(profile.weight_kg as i32);
                        ui.set_bmi_weight(profile.weight_kg.to_string().into());
                        ui.set_bmi_height(profile.height_cm.to_string().into());
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
            ui.set_first_name("Friend".into());
            ui.set_profile_name("Friend".into());
            ui.set_profile_email("".into());
            ui.set_profile_tier("Free".into());
            ui.set_needs_onboarding(false);
            ui.set_form_error("".into());
            ui.set_community_open_id("".into());
            ui.set_community_replies(ModelRc::new(VecModel::from(Vec::<CommunityPost>::new())));
            ui.set_community_reply_status("".into());
            ui.set_status_text("Connect your account to sync today's log.".into());
            ui.set_history(ModelRc::new(VecModel::from(Vec::<DayLog>::new())));
            ui.set_streak(0);
            api::clear_logs();
            ui.set_tab(0);
        }
    });

    let handle = ui.as_weak();
    ui.on_save_onboarding(move || {
        let Some(ui) = handle.upgrade() else {
            return;
        };
        let input = api::ProfileInput {
            name: ui.get_form_name().trim().to_string(),
            age: ui.get_form_age().parse().unwrap_or(22),
            gender: ui.get_form_gender().to_string(),
            height_cm: ui.get_form_height().parse().unwrap_or(170),
            weight_kg: ui.get_form_weight().parse().unwrap_or(65),
            goal: ui.get_form_goal().to_string(),
            place: ui.get_form_place().to_string(),
            experience: ui.get_form_experience().to_string(),
            diet: ui.get_form_diet().to_string(),
            days_per_week: ui.get_form_days().parse().unwrap_or(4),
            budget_per_day: ui.get_form_budget().parse().unwrap_or(150),
            health_conditions: {
                let mut conditions = Vec::new();
                if ui.get_health_diabetes() {
                    conditions.push("diabetes".to_string());
                }
                if ui.get_health_heart() {
                    conditions.push("heart_disease".to_string());
                }
                if ui.get_health_bp() {
                    conditions.push("bp".to_string());
                }
                if ui.get_health_joint() {
                    conditions.push("joint".to_string());
                }
                conditions
            },
        };
        if input.name.is_empty() {
            ui.set_form_error("Enter your name".into());
            return;
        }
        ui.set_form_error("".into());
        let handle = handle.clone();
        std::thread::spawn(move || {
            let result = api::save_profile(&input);
            let handle = handle.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = handle.upgrade() {
                    match result {
                        Ok(profile) => {
                            let tier = match profile.tier.as_str() {
                                "pro" => "Basic",
                                "premium" => "Elite",
                                _ => "Free",
                            };
                            ui.set_needs_onboarding(false);
                            ui.set_form_error("".into());
                            ui.set_first_name(first_word(&profile.name).into());
                            ui.set_user_name(profile.name.clone().into());
                            ui.set_profile_name(profile.name.into());
                            ui.set_profile_email(profile.email.into());
                            ui.set_profile_age(profile.age as i32);
                            ui.set_profile_height(profile.height_cm as i32);
                            ui.set_profile_weight(profile.weight_kg as i32);
                            ui.set_bmi_weight(profile.weight_kg.to_string().into());
                            ui.set_bmi_height(profile.height_cm.to_string().into());
                            ui.set_profile_goal(profile.goal.into());
                            ui.set_profile_diet(profile.diet.into());
                            ui.set_profile_days(profile.days_per_week as i32);
                            ui.set_profile_budget(profile.budget_per_day as i32);
                            ui.set_profile_tier(tier.into());
                            ui.set_status_text("Profile saved".into());
                            ui.invoke_refresh();
                        }
                        Err(error) => ui.set_form_error(error.into()),
                    }
                }
            })
            .ok();
        });
    });

    let handle = ui.as_weak();
    ui.on_skip_onboarding(move || {
        if let Some(ui) = handle.upgrade() {
            ui.set_needs_onboarding(false);
            ui.set_form_error("".into());
        }
    });

    let handle = ui.as_weak();
    ui.on_load_nutrition(move || {
        let handle = handle.clone();
        std::thread::spawn(move || {
            let profile = api::fetch_profile();
            let plan = api::fetch_meal_plan();
            let handle = handle.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = handle.upgrade() {
                    match (profile, plan) {
                        (Ok(profile), Ok(plan)) => {
                            let targets = api::calc_targets(&profile);
                            ui.set_target_calories(targets.calories as i32);
                            ui.set_target_protein(targets.protein as i32);
                            ui.set_target_carbs(targets.carbs as i32);
                            ui.set_target_fat(targets.fat as i32);
                            ui.set_nutrition_title(plan.title.clone().into());
                            let items: Vec<MealItem> = plan
                                .meals
                                .iter()
                                .map(|meal| MealItem {
                                    name: meal.name.clone().into(),
                                    items: meal.items.clone().into(),
                                    kcal: meal.kcal as i32,
                                    protein: meal.protein as i32,
                                })
                                .collect();
                            let empty = items.is_empty();
                            ui.set_nutrition_meals(ModelRc::new(VecModel::from(items)));
                            ui.set_nutrition_status(if empty {
                                "No meal plan yet — the daily planner will fill this after it runs."
                                    .into()
                            } else {
                                "Today's meal plan".into()
                            });
                        }
                        (Err(error), _) => ui.set_nutrition_status(error.into()),
                        (_, Err(error)) => ui.set_nutrition_status(error.into()),
                    }
                }
            })
            .ok();
        });
    });

    let handle = ui.as_weak();
    ui.on_load_workout(move || {
        let handle = handle.clone();
        std::thread::spawn(move || {
            let result = api::fetch_workout();
            let handle = handle.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = handle.upgrade() {
                    match result {
                        Ok(days) => {
                            let items: Vec<WorkoutDay> = days
                                .iter()
                                .map(|day| WorkoutDay {
                                    day_index: day.day_index as i32,
                                    title: day.title.clone().into(),
                                    focus: day.focus.clone().into(),
                                    summary: day.summary.clone().into(),
                                    completed: day.completed,
                                    exercises: ModelRc::new(VecModel::from(
                                        day.exercises
                                            .iter()
                                            .map(|exercise| ExerciseItem {
                                                index: exercise.index as i32,
                                                name: exercise.name.clone().into(),
                                                sets: exercise.sets as i32,
                                                reps: exercise.reps.clone().into(),
                                                rest: exercise.rest.clone().into(),
                                                muscles: exercise.muscles.clone().into(),
                                                tips: exercise.tips.clone().into(),
                                                alt: exercise.alt.clone().into(),
                                            })
                                            .collect::<Vec<_>>(),
                                    )),
                                })
                                .collect();
                            let empty = items.is_empty();
                            if !items.is_empty() {
                                let weekday = chrono::Datelike::weekday(&chrono::Local::now())
                                    .num_days_from_sunday()
                                    as usize;
                                let day = &items[weekday % items.len()];
                                ui.set_session_title(day.title.clone().into());
                                ui.set_session_focus(day.focus.clone().into());
                                ui.set_session_meta(
                                    format!("{} moves · ~45 min", day.exercises.row_count()).into(),
                                );
                            }
                            ui.set_workout_days(ModelRc::new(VecModel::from(items)));
                            ui.set_workout_status(if empty {
                                "No workout plan yet — the daily planner will fill this after it runs.".into()
                            } else {
                                "Today's workout".into()
                            });
                        }
                        Err(error) => ui.set_workout_status(error.into()),
                    }
                }
            })
            .ok();
        });
    });

    let handle = ui.as_weak();
    ui.on_complete_workout(move |day_index, title| {
        let title = title.to_string();
        let handle = handle.clone();
        std::thread::spawn(move || {
            let result = api::complete_workout(day_index as i64, &title);
            let handle = handle.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = handle.upgrade() {
                    match result {
                        Ok(()) => {
                            ui.set_workout_status("Day marked complete".into());
                            persist_today(&ui, None, None, None, None, Some(true), None);
                            ui.invoke_load_workout();
                        }
                        Err(error) => ui.set_workout_status(error.into()),
                    }
                }
            })
            .ok();
        });
    });

    let handle = ui.as_weak();
    ui.on_load_chat(move || {
        let handle = handle.clone();
        std::thread::spawn(move || {
            let result = api::fetch_coach_session();
            let handle = handle.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = handle.upgrade() {
                    match result {
                        Ok(session) => {
                            ui.set_chat_session_id(session.id.into());
                            let items: Vec<ChatMessage> = session
                                .messages
                                .iter()
                                .map(|message| ChatMessage {
                                    role: message.role.clone().into(),
                                    content: message.content.clone().into(),
                                })
                                .collect();
                            let empty = items.is_empty();
                            ui.set_chat_messages(ModelRc::new(VecModel::from(items)));
                            ui.set_chat_status(if empty {
                                "Ask about training, food, or recovery.".into()
                            } else {
                                "Chat loaded".into()
                            });
                        }
                        Err(error) => ui.set_chat_status(error.into()),
                    }
                }
            })
            .ok();
        });
    });

    let handle = ui.as_weak();
    ui.on_send_chat(move || {
        let Some(ui) = handle.upgrade() else {
            return;
        };
        if ui.get_chat_busy() {
            return;
        }
        let message = ui.get_chat_input().to_string().trim().to_string();
        let session_id = ui.get_chat_session_id().to_string();
        if message.is_empty() {
            return;
        }
        if session_id.is_empty() {
            ui.set_chat_status("No chat session yet. Tap New chat.".into());
            return;
        }

        let mut items: Vec<ChatMessage> = ui.get_chat_messages().iter().collect();
        items.push(ChatMessage {
            role: "user".into(),
            content: message.clone().into(),
        });
        ui.set_chat_messages(ModelRc::new(VecModel::from(items)));
        ui.set_chat_input("".into());
        ui.set_chat_busy(true);
        ui.set_chat_status("Coach is thinking...".into());

        let handle = handle.clone();
        std::thread::spawn(move || {
            let result = api::send_coach_message(&session_id, &message);
            let handle = handle.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = handle.upgrade() {
                    ui.set_chat_busy(false);
                    match result {
                        Ok(reply) => {
                            let mut items: Vec<ChatMessage> =
                                ui.get_chat_messages().iter().collect();
                            items.push(ChatMessage {
                                role: "assistant".into(),
                                content: reply.into(),
                            });
                            ui.set_chat_messages(ModelRc::new(VecModel::from(items)));
                            ui.set_chat_status("".into());
                        }
                        Err(error) => ui.set_chat_status(error.into()),
                    }
                }
            })
            .ok();
        });
    });

    let handle = ui.as_weak();
    ui.on_load_coach_sessions(move || {
        let handle = handle.clone();
        std::thread::spawn(move || {
            let result = api::fetch_coach_sessions();
            let handle = handle.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = handle.upgrade() {
                    if let Ok(sessions) = result {
                        let items: Vec<CoachSessionSummary> = sessions
                            .into_iter()
                            .map(|session| CoachSessionSummary {
                                id: session.id.into(),
                                title: session.title.into(),
                                message_count: session.message_count as i32,
                            })
                            .collect();
                        ui.set_coach_sessions(ModelRc::new(VecModel::from(items)));
                    }
                }
            })
            .ok();
        });
    });

    let handle = ui.as_weak();
    ui.on_switch_chat(move |id| {
        let id = id.to_string();
        let handle = handle.clone();
        std::thread::spawn(move || {
            let result = api::fetch_coach_messages(&id);
            let handle = handle.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = handle.upgrade() {
                    if let Ok(session) = result {
                        let items: Vec<ChatMessage> = session
                            .messages
                            .iter()
                            .map(|message| ChatMessage {
                                role: message.role.clone().into(),
                                content: message.content.clone().into(),
                            })
                            .collect();
                        ui.set_chat_session_id(session.id.into());
                        ui.set_chat_messages(ModelRc::new(VecModel::from(items)));
                        ui.set_chat_status("Chat loaded".into());
                    }
                }
            })
            .ok();
        });
    });

    let handle = ui.as_weak();
    ui.on_new_chat(move || {
        let handle = handle.clone();
        std::thread::spawn(move || {
            let result = api::create_coach_session();
            let handle = handle.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = handle.upgrade() {
                    match result {
                        Ok(id) => {
                            ui.set_coach_recents(false);
                            ui.set_chat_session_id(id.into());
                            ui.set_chat_messages(ModelRc::new(VecModel::from(
                                Vec::<ChatMessage>::new(),
                            )));
                            ui.set_chat_status("New chat ready".into());
                        }
                        Err(error) => ui.set_chat_status(error.into()),
                    }
                }
            })
            .ok();
        });
    });

    let handle = ui.as_weak();
    ui.on_load_community(move || {
        let handle = handle.clone();
        std::thread::spawn(move || {
            let result = api::fetch_community_feed(30);
            let handle = handle.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = handle.upgrade() {
                    match result {
                        Ok(posts) => {
                            let items: Vec<CommunityPost> = posts
                                .iter()
                                .map(|post| CommunityPost {
                                    id: post.id.clone().into(),
                                    author: post.author.clone().into(),
                                    text: post.text.clone().into(),
                                    likes: post.likes as i32,
                                    liked_by_me: post.liked_by_me,
                                    reply_count: post.reply_count as i32,
                                })
                                .collect();
                            let empty = items.is_empty();
                            ui.set_community_posts(ModelRc::new(VecModel::from(items)));
                            ui.set_community_status(if empty {
                                "No posts yet. Share the first one.".into()
                            } else {
                                "Community feed".into()
                            });
                        }
                        Err(error) => ui.set_community_status(error.into()),
                    }
                }
            })
            .ok();
        });
    });

    let handle = ui.as_weak();
    ui.on_search_community(move || {
        let Some(ui) = handle.upgrade() else {
            return;
        };
        let query = ui.get_community_search().trim().to_string();
        if query.is_empty() {
            ui.invoke_load_community();
            return;
        }
        ui.set_community_status(format!("Searching for \"{query}\"...").into());
        let handle = handle.clone();
        std::thread::spawn(move || {
            let result = api::search_community(&query);
            let handle = handle.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = handle.upgrade() {
                    match result {
                        Ok(posts) => {
                            let items: Vec<CommunityPost> = posts
                                .iter()
                                .map(|post| CommunityPost {
                                    id: post.id.clone().into(),
                                    author: post.author.clone().into(),
                                    text: post.text.clone().into(),
                                    likes: post.likes as i32,
                                    liked_by_me: post.liked_by_me,
                                    reply_count: post.reply_count as i32,
                                })
                                .collect();
                            ui.set_community_posts(ModelRc::new(VecModel::from(items)));
                            ui.set_community_status(
                                format!("Search results for \"{query}\".").into(),
                            );
                        }
                        Err(error) => ui.set_community_status(error.into()),
                    }
                }
            })
            .ok();
        });
    });

    let handle = ui.as_weak();
    ui.on_post_community(move || {
        let Some(ui) = handle.upgrade() else {
            return;
        };
        if ui.get_community_busy() {
            return;
        }
        let text = ui.get_community_input().to_string().trim().to_string();
        if text.is_empty() {
            return;
        }
        ui.set_community_busy(true);
        ui.set_community_status("Posting...".into());
        let handle = handle.clone();
        std::thread::spawn(move || {
            let result = api::create_community_post(&text);
            let handle = handle.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = handle.upgrade() {
                    ui.set_community_busy(false);
                    match result {
                        Ok(_) => {
                            ui.set_community_input("".into());
                            ui.set_community_status("Posted".into());
                            ui.invoke_load_community();
                        }
                        Err(error) => ui.set_community_status(error.into()),
                    }
                }
            })
            .ok();
        });
    });

    let handle = ui.as_weak();
    ui.on_like_community(move |post_id| {
        let post_id = post_id.to_string();
        let handle = handle.clone();
        std::thread::spawn(move || {
            let result = api::toggle_community_like(&post_id);
            let handle = handle.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = handle.upgrade() {
                    if let Ok((liked, count)) = result {
                        let mut items: Vec<CommunityPost> =
                            ui.get_community_posts().iter().collect();
                        for item in &mut items {
                            if item.id == post_id {
                                item.liked_by_me = liked;
                                item.likes = count as i32;
                            }
                        }
                        ui.set_community_posts(ModelRc::new(VecModel::from(items)));
                    }
                }
            })
            .ok();
        });
    });

    let handle = ui.as_weak();
    ui.on_checkout(move |tier| {
        let tier = tier.to_string();
        let handle = handle.clone();
        std::thread::spawn(move || {
            let result = api::create_checkout(&tier);
            let handle = handle.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = handle.upgrade() {
                    match result {
                        Ok(url) => {
                            if let Err(error) = webbrowser::open(&url) {
                                ui.set_status_text(
                                    format!("Could not open checkout: {error}").into(),
                                );
                            } else {
                                ui.set_status_text(
                                    "Complete payment in your browser, then refresh profile."
                                        .into(),
                                );
                            }
                        }
                        Err(error) => ui.set_status_text(error.into()),
                    }
                }
            })
            .ok();
        });
    });

    let handle = ui.as_weak();
    ui.on_edit_profile(move || {
        if let Some(ui) = handle.upgrade() {
            ui.set_needs_onboarding(true);
            ui.set_form_error("".into());
        }
    });

    let handle = ui.as_weak();
    ui.on_open_community_post(move |post_id| {
        let post_id = post_id.to_string();
        let Some(ui) = handle.upgrade() else {
            return;
        };
        if let Some(post) = ui
            .get_community_posts()
            .iter()
            .find(|post| post.id.as_str() == post_id.as_str())
        {
            ui.set_community_open_id(post.id.clone());
            ui.set_community_open_author(post.author.clone());
            ui.set_community_open_text(post.text.clone());
        } else {
            ui.set_community_open_id(post_id.clone().into());
        }
        ui.set_community_reply_status("Loading replies...".into());

        let handle = handle.clone();
        std::thread::spawn(move || {
            let result = api::fetch_community_post(&post_id);
            let handle = handle.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = handle.upgrade() {
                    match result {
                        Ok((post, replies)) => {
                            ui.set_community_open_id(post.id.into());
                            ui.set_community_open_author(post.author.into());
                            ui.set_community_open_text(post.text.into());
                            let items: Vec<CommunityPost> = replies
                                .iter()
                                .map(|reply| CommunityPost {
                                    id: reply.id.clone().into(),
                                    author: reply.author.clone().into(),
                                    text: reply.text.clone().into(),
                                    likes: reply.likes as i32,
                                    liked_by_me: reply.liked_by_me,
                                    reply_count: reply.reply_count as i32,
                                })
                                .collect();
                            ui.set_community_replies(ModelRc::new(VecModel::from(items)));
                            ui.set_community_reply_status("".into());
                        }
                        Err(error) => ui.set_community_reply_status(error.into()),
                    }
                }
            })
            .ok();
        });
    });

    let handle = ui.as_weak();
    ui.on_close_community_post(move || {
        if let Some(ui) = handle.upgrade() {
            ui.set_community_open_id("".into());
            ui.set_community_replies(ModelRc::new(VecModel::from(Vec::<CommunityPost>::new())));
            ui.set_community_reply_input("".into());
            ui.set_community_reply_status("".into());
        }
    });

    let handle = ui.as_weak();
    ui.on_send_community_reply(move || {
        let Some(ui) = handle.upgrade() else {
            return;
        };
        let post_id = ui.get_community_open_id().to_string();
        let text = ui
            .get_community_reply_input()
            .to_string()
            .trim()
            .to_string();
        if post_id.is_empty() || text.is_empty() {
            return;
        }
        ui.set_community_reply_status("Replying...".into());
        let handle = handle.clone();
        std::thread::spawn(move || {
            let result = api::reply_community_post(&post_id, &text);
            let handle = handle.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = handle.upgrade() {
                    match result {
                        Ok(_) => {
                            ui.set_community_reply_input("".into());
                            ui.set_community_reply_status("".into());
                            ui.invoke_load_community();
                            ui.invoke_open_community_post(post_id.into());
                        }
                        Err(error) => ui.set_community_reply_status(error.into()),
                    }
                }
            })
            .ok();
        });
    });

    let handle = ui.as_weak();
    ui.on_set_tab(move |tab| {
        if let Some(ui) = handle.upgrade() {
            ui.set_tab(tab);
            if tab == 1 {
                ui.invoke_load_workout();
            }
            if tab == 2 {
                ui.invoke_load_nutrition();
            }
            if tab == 3 {
                ui.invoke_load_chat();
            }
            if tab == 5 {
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
        ui.set_auth_status("Opening Google...".into());
        let handle = handle.clone();
        std::thread::spawn(move || {
            let started = match api::start_google_login() {
                Ok(started) => started,
                Err(error) => {
                    finish_google_error(&handle, &error);
                    return;
                }
            };
            if let Err(error) = webbrowser::open(&started.auth_url) {
                finish_google_error(
                    &handle,
                    &format!("Could not open your browser to sign in: {error}"),
                );
                return;
            }

            let ui_handle = handle.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = ui_handle.upgrade() {
                    ui.set_auth_status(
                        "Finish signing in with Google in your browser, then come back...".into(),
                    );
                }
            })
            .ok();

            let deadline = Instant::now() + Duration::from_secs(600);
            let mut consecutive_errors = 0u32;
            loop {
                if Instant::now() > deadline {
                    finish_google_error(&handle, "Google sign-in timed out.");
                    return;
                }
                std::thread::sleep(Duration::from_secs(2));
                match api::poll_google_login(&started.state) {
                    Ok(api::GooglePoll::Pending) => {
                        consecutive_errors = 0;
                    }
                    Ok(api::GooglePoll::Ok { token, name }) => {
                        api::set_token(Some(token));
                        let ui_handle = handle.clone();
                        slint::invoke_from_event_loop(move || {
                            if let Some(ui) = ui_handle.upgrade() {
                                ui.set_signed_in(true);
                                ui.set_user_name(name.into());
                                ui.set_status_text("Signed in with Google".into());
                                ui.set_google_busy(false);
                                ui.set_auth_status("".into());
                                ui.invoke_refresh();
                                ui.invoke_load_profile();
                            }
                        })
                        .ok();
                        return;
                    }
                    Ok(api::GooglePoll::Error(message)) => {
                        finish_google_error(&handle, &message);
                        return;
                    }
                    Ok(api::GooglePoll::Expired) => {
                        finish_google_error(
                            &handle,
                            "This Google sign-in expired. Please try again.",
                        );
                        return;
                    }
                    Err(error) => {
                        consecutive_errors += 1;
                        if consecutive_errors >= 15 {
                            finish_google_error(&handle, &error);
                            return;
                        }
                    }
                }
            }
        });
    });

    ui.invoke_refresh();
    if ui.get_signed_in() {
        ui.invoke_load_profile();
        ui.invoke_load_workout();
        ui.invoke_load_nutrition();
        ui.invoke_load_community();
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
