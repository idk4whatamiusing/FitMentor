# FitMentor Native

The native FitMentor client: Rust + Slint, one codebase for **desktop**
(macOS/Linux/Windows) and **Android**. Both targets share the same UI, API
client, auth flow, and persistence.

## Design system

The native UI and the web app share one editorial system: cream paper by
default, ink in dark mode, and a single signal-orange accent. Tokens live in
`ui/theme.slint`, shared components in `ui/components.slint`, photography in
`ui/images/`, and the Onest/Michroma fonts in `ui/fonts/` (SIL OFL). Sources
and licenses are listed in [`ASSETS.md`](../../ASSETS.md).

The theme follows the system on first launch and is persisted next to the
token. For previews, `FITMENTOR_THEME=light|dark` overrides it and
`FITMENTOR_TAB=0..5` opens a specific tab (Home, Train, Food, Coach, Tools,
You). Daily logs are stored server-side in CockroachDB; the local file is only
an offline cache.

## Mobile-web parity

The native screens are mirrored from the mobile web build at a 390 × 844
viewport. Preview flags:

```bash
FITMENTOR_TAB=0..5          # Home, Train, Food, Coach, Tools, You
FITMENTOR_PROGRESS=1        # open the progress screen
FITMENTOR_ONBOARDING=1      # open onboarding
FITMENTOR_STEP=0..8         # onboarding step
FITMENTOR_THEME=light|dark  # force a theme
```

The layouts, tokens, icons, photography, and copy match the web app. Slint's
text renderer differs from a browser by a small amount, so glyph edges and
line wrapping can vary by a pixel. The progress report button opens the web
report in the system browser.

## Desktop

```bash
cd apps/native
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
`.github/workflows/build-native-apk.yml` and uploads
`FitMentor-Native-APK`.

## What's included

- Google sign-in with browser redirect + JWT persistence.
- Today dashboard: water, sleep, steps, protein, quick log.
- Food: daily targets and today's AI meal plan.
- Train: today's workout plan, exercise summaries, completions.
- Coach: persistent chat sessions with AI quota handling.
- Feed: community posts, likes, replies, notifications.
- You: profile, subscription, edit profile, sign out.
- Checkout: opens Polar in the system browser.
- Light and dark themes, following the system by default.

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
