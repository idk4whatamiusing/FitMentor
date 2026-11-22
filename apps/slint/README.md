# FitMentor Slint (Android spike)

A native Rust/Slint mobile client for FitMentor. This is the first spike:
Today dashboard + quick log + live API refresh, with placeholder tabs for
Nutrition, Workouts, Coach, and Profile.

## Desktop

```bash
cd apps/slint
FITMENTOR_API_URL="https://...lambda-url...on.aws" \
FITMENTOR_API_KEY="$API_SHARED_SECRET" \
FITMENTOR_USER_ID="google:..." \
FITMENTOR_USER_NAME="Your name" \
cargo run
```

Headless API check:

```bash
cargo run -- --check-api
```

The app calls `GET /v1/logs/today` with `x-api-key` + `x-user-id` and updates
the dashboard. Without those env vars it shows a setup message.

## Android

Slint uses `android-activity` through the `backend-android-activity-06`
feature. The crate is a `cdylib` and exports `android_main`.

CI builds an arm64 APK with `cargo-apk2` + NDK r30:

```bash
cargo install cargo-apk2
cargo apk2 build --target aarch64-linux-android --lib --release
```

The APK is written to `target/release/apk/`. The GitHub workflow is
`.github/workflows/build-slint-apk.yml` and uploads `FitMentor-Slint-APK`.

## Current scope

- Native Slint UI with bottom navigation and a dark mobile theme.
- Today screen with water/sleep/steps/protein cards.
- Quick log increments (local state).
- Live API refresh (desktop spike).
- Placeholder tabs for the remaining screens.

## Next

- Mobile auth: Google Sign-In + short-lived JWT (do not ship the shared secret
  in the APK).
- Port Onboarding, Nutrition, Workouts, Coach, Progress, Tools, and Profile.
- Persist quick-log changes to the API.
- Wire Polar checkout to open in the system browser and refresh the tier.

## Sign in with Google

The app uses the browser redirect flow, the same consent screen as the web app:

1. Tap **Continue with Google**. The app calls `POST /v1/auth/google/start` and
   opens the returned URL in the system browser.
2. Sign in with Google. The browser returns to the Lambda callback
   (`/v1/auth/google/callback`), which exchanges the code and stores the
   FitMentor JWT against the login state.
3. The app polls `POST /v1/auth/google/poll` every two seconds and signs in
   when the callback completes.

No Google client ID or secret ships in the APK. The Lambda holds
`GOOGLE_WEB_CLIENT_ID` and `GOOGLE_WEB_CLIENT_SECRET`; the redirect URI is
`GOOGLE_WEB_REDIRECT_URI` and must be registered on that OAuth client
(**Web application** type) in Google Cloud Console.

The legacy device-code endpoint (`POST /v1/auth/google/device`) remains on the
API for TVs/limited-input clients, but the app no longer uses it.

Without a configured web client the app falls back to the paste-a-token flow.
Tokens can be minted locally with:

```bash
cd api
set -a && . ../.env && set +a
cargo run --bin mint-token -- google:... you@example.com
```

## Token persistence

The FitMentor JWT is stored on disk after sign-in (desktop:
`~/.fitmentor/token`, Android: the app's internal data directory) with
`0600` permissions on Unix. The app auto-signs-in on launch and clears the
token when you tap **Sign out** in the You tab.

The You tab loads `/v1/user/me` and `/v1/user/subscription` to show the
profile and current plan.

## Nutrition

The Food tab calculates daily targets (Mifflin-St Jeor + activity) and loads
today's AI meal plan from `GET /v1/meal/today`. It shows calories, protein,
carbs, fat, and each meal's items/macros; **Refresh** reloads both.

## Workouts

The Train tab loads `GET /v1/workout/today`, shows each day's focus and
exercise summary, marks completed days from `/v1/workout/completions`, and
posts completions to `/v1/workout/complete`.

## Coach

The Coach tab loads the latest chat session (or creates one), shows message
history, and posts new messages to `POST /v1/coach/chat`. That endpoint checks
the AI quota, builds the profile-aware system prompt, calls Workers AI through
the Pages gateway, and stores both turns in `chat_sessions`.

## Profile editing and community replies

- The You tab has **Edit profile**, which reopens the onboarding form pre-filled.
- Community posts can be opened to view replies and post a reply; reply counts
  refresh on the feed.
