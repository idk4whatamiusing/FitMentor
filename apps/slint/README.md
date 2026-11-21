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

## Google device sign-in

1. Google Cloud Console -> APIs & Services -> Credentials -> Create OAuth
   client ID -> application type **TVs and Limited Input devices**.
2. Set the same client ID in two places:
   - `FITMENTOR_GOOGLE_CLIENT_ID` for the Slint build (GitHub secret or local env).
   - `GOOGLE_CLIENT_IDS` for the API/Terraform (GitHub secret).
3. Tap **Sign in with Google** in the app, open the displayed URL on any device,
   and enter the code.
4. The app exchanges the resulting Google ID token with `/v1/auth/google` and
   stores the FitMentor JWT in memory.

Without a client ID the app falls back to the paste-a-token flow. Tokens can be
minted locally with:

```bash
cd api
set -a && . ../.env && set +a
cargo run --bin mint-token -- google:... you@example.com
```
