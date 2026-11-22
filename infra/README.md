# FitMentor on AWS Lambda + CockroachDB

The API in `api/` is a Rust Lambda function (Axum + `sqlx`) backed by
CockroachDB Serverless. The TanStack Start UI stays on Cloudflare Pages and
calls the API server-to-server with `x-api-key` + `x-user-id`.

```
Browser -> Cloudflare Pages (OAuth, sessions, Workers AI)
              |  server-side fetch
              v
        Lambda Function URL -> Rust API -> CockroachDB
              ^
              └── EventBridge Scheduler (daily planner)
```

## One-time setup

```bash
# 1. AWS auth (profile with permission to create IAM/S3/DynamoDB)
export AWS_PROFILE=newacct AWS_REGION=ap-south-1

# 2. Terraform state bucket, lock table, GitHub OIDC deploy role
cd infra/bootstrap
terraform init
terraform apply

# 3. CockroachDB schema (creates 15 app tables)
psql "$DATABASE_URL" -f api/migrations/cockroach/0001_init.sql
```

The bootstrap output contains `deploy_role_arn`; add it (plus `DATABASE_URL`
and `API_SHARED_SECRET`) as GitHub Actions secrets.

## Deploy

```bash
cd api
cargo lambda build --release --output-format zip   # -> target/lambda/{api,planner}/bootstrap.zip

cd ../infra/app
export TF_VAR_database_url="$DATABASE_URL"
export TF_VAR_api_shared_secret="$API_SHARED_SECRET"
terraform init
terraform apply
```

On push to `main`, `.github/workflows/deploy-lambda.yml` does both steps via
GitHub OIDC (no long-lived AWS keys).

## Cloudflare Pages settings (required for cutover)

Set these in the Pages project (`fitmentor`) and redeploy:

| Variable | Value |
|---|---|
| `API_URL` | Lambda Function URL from `terraform output api_function_url` |
| `API_SHARED_SECRET` | **must equal** the Lambda value |
| `APP_URL` | `https://fitmentor-ey9.pages.dev` |

`AI_WORKER_URL` is a Lambda environment variable (Terraform default points at
the Pages `/api/ai/complete` route), not a Pages setting. Sessions/auth stay on
Pages; no frontend code changes are needed.

## Data migration from D1

```bash
npx wrangler d1 export fitmentor --remote --output=d1-dump.sql
python3 scripts/migrate-d1-to-crdb.py \
  --dump d1-dump.sql \
  --database-url "$DATABASE_URL" \
  --fresh
```

`--fresh` truncates the destination tables first. The script verifies row
counts per table at the end.

## Rollback

The old Cloudflare Worker and D1 database are untouched until you delete them.
Point Pages `API_URL` back at the Worker to roll back. Once the Lambda has been
stable for a while, remove `api/wrangler.toml`, the D1 database, and the KV
namespace.

## Current status

- `fitmentor-api` and `fitmentor-planner` are deployed in `ap-south-1`
  (account `836090573337`).
- API Function URL:
  `https://vfvwjpw567ghnqwknc2m74thx40jmpiw.lambda-url.ap-south-1.on.aws/`
- CockroachDB `fitmentor` database and `fitmentor_app` user are provisioned and
  the schema is applied.
- Cloudflare Pages env is set (`API_URL`, `API_SHARED_SECRET`, `APP_URL`) and
  the project was redeployed. The Workers AI gateway now authenticates against
  the Lambda secret.
- D1 data was migrated and row counts verified (2 users, 1 daily log, 1 workout
  completion, 1 chat session, 23 rows in each daily-plan table).
- Polar payments are wired: `POST /v1/subscriptions/checkout`,
  `GET /v1/user/subscription`, and `POST /v1/webhooks/polar`. The Lambda
  webhook endpoint is registered in Polar; the old endpoints were deleted.
- Polar still needs organization onboarding (`checkout_payments` is currently
  false) before live payments can complete.
- Community is live: feed, posts, likes, replies, reshares, notifications,
  search, reports, and blocks. Media uploads are not enabled yet (text-only).
- Remaining cleanup: rotate the CockroachDB `ai` password, enable MFA on the
  AWS root/admin account, and decide on the Slint Android migration.

## Notes

- Lambda uses `x86_64` + `provided.al2023`; the package is a single `bootstrap`
  binary (the CockroachDB CA cert is embedded).
- No VPC/NAT: CockroachDB Serverless has a public TLS endpoint.
- Planner runs daily at 00:30 UTC via EventBridge Scheduler; AI calls still go
  through the Pages Workers AI gateway.

## Mobile auth

- `JWT_SECRET` signs the mobile JWTs (30-day TTL, `JWT_TTL_DAYS`).
- `GOOGLE_CLIENT_IDS` is a comma-separated allow-list of Google OAuth client
  IDs accepted by `POST /v1/auth/google`. It should include the web client ID.
- `GOOGLE_WEB_CLIENT_ID` / `GOOGLE_WEB_CLIENT_SECRET` drive the Slint browser
  redirect flow (`/v1/auth/google/start`, `/v1/auth/google/callback`,
  `/v1/auth/google/poll`). The client must be a **Web application** OAuth client
  with `GOOGLE_WEB_REDIRECT_URI` registered as an authorized redirect URI.
- `GOOGLE_CLIENT_SECRET` is kept for the legacy device-code flow
  (`POST /v1/auth/google/device`). Neither secret ships in the APK.

