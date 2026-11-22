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
                        let needs_onboarding = profile.name == "Friend";
                        ui.set_needs_onboarding(needs_onboarding);
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
            ui.set_needs_onboarding(false);
            ui.set_form_error("".into());
            ui.set_community_open_id("".into());
            ui.set_community_replies(ModelRc::new(VecModel::from(Vec::<CommunityPost>::new())));
            ui.set_community_reply_status("".into());
            ui.set_status_text("Connect your account to sync today's log.".into());
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
                            ui.set_user_name(profile.name.clone().into());
                            ui.set_profile_name(profile.name.into());
                            ui.set_profile_email(profile.email.into());
                            ui.set_profile_age(profile.age as i32);
                            ui.set_profile_height(profile.height_cm as i32);
                            ui.set_profile_weight(profile.weight_kg as i32);
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
                                })
                                .collect();
                            let empty = items.is_empty();
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
    ui.on_new_chat(move || {
        let handle = handle.clone();
        std::thread::spawn(move || {
            let result = api::create_coach_session();
            let handle = handle.clone();
            slint::invoke_from_event_loop(move || {
                if let Some(ui) = handle.upgrade() {
                    match result {
                        Ok(id) => {
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
                ui.invoke_load_nutrition();
            }
            if tab == 2 {
                ui.invoke_load_workout();
            }
            if tab == 3 {
                ui.invoke_load_chat();
            }
            if tab == 4 {
                ui.invoke_load_profile();
            }
            if tab == 5 {
                ui.invoke_load_community();
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
