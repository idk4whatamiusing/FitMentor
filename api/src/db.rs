//! Database pools.
//!
//! CockroachDB holds identity, health logs, plans, and coach memory. Aurora
//! DSQL holds community data. The cluster certificate is embedded in the
//! binary and written to `/tmp` on cold start so the deployment package stays
//! a single `bootstrap` executable.

use sqlx::postgres::{PgConnectOptions, PgPoolOptions, PgSslMode};
use sqlx::PgPool;
use std::time::Duration;

const COCKROACH_ROOT_CERT: &str = include_str!("../certs/root.crt");
const CERT_PATH: &str = "/tmp/fitmentor-cockroach-root.crt";

pub async fn connect(database_url: &str) -> Result<PgPool, sqlx::Error> {
    let mut opts: PgConnectOptions = database_url.parse()?;

    if opts.get_host().contains("cockroachlabs.cloud") {
        std::fs::write(CERT_PATH, COCKROACH_ROOT_CERT).map_err(sqlx::Error::Io)?;
        opts = opts
            .ssl_mode(PgSslMode::VerifyFull)
            .ssl_root_cert(CERT_PATH);
    }

    PgPoolOptions::new()
        .max_connections(4)
        .acquire_timeout(Duration::from_secs(8))
        .idle_timeout(Duration::from_secs(300))
        .max_lifetime(Duration::from_secs(1800))
        .connect_with(opts)
        .await
}

/// Connect to Aurora DSQL for community data.
///
/// The AWS Labs connector generates the IAM auth token, refreshes it in the
/// background, and keeps the standard `sqlx::PgPool` interface.
pub async fn connect_dsql(database_url: &str) -> Result<PgPool, String> {
    aurora_dsql_sqlx_connector::pool::connect(database_url)
        .await
        .map_err(|error| format!("dsql connect failed: {error}"))
}

/// Apply the embedded DSQL schema.
///
/// DSQL allows only one DDL statement per transaction, so statements are
/// executed one at a time (autocommit). OCC retries cover two Lambda cold
/// starts racing to create the same tables.
pub async fn migrate_dsql(pool: &PgPool) -> Result<(), String> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dsql_schema_migrations (
            version    TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
        )",
    )
    .execute(pool)
    .await
    .map_err(|error| format!("dsql migration table failed: {error}"))?;

    for (version, sql) in DSQL_MIGRATIONS {
        let applied = sqlx::query_scalar::<_, String>(
            "SELECT version FROM dsql_schema_migrations WHERE version = $1",
        )
        .bind(version)
        .fetch_optional(pool)
        .await
        .map_err(|error| format!("dsql migration check failed: {error}"))?;
        if applied.is_some() {
            continue;
        }

        for statement in split_statements(sql) {
            aurora_dsql_sqlx_connector::retry_on_occ(
                &aurora_dsql_sqlx_connector::OCCRetryConfig::default(),
                || async { sqlx::query(statement).execute(pool).await.map(|_| ()) },
            )
            .await
            .map_err(|error| format!("dsql migration {version} failed: {error}"))?;
        }

        sqlx::query(
            "INSERT INTO dsql_schema_migrations (version, applied_at) VALUES ($1, $2)
             ON CONFLICT (version) DO NOTHING",
        )
        .bind(version)
        .bind(now_text())
        .execute(pool)
        .await
        .map_err(|error| format!("dsql migration record failed: {error}"))?;
    }

    Ok(())
}

/// Timestamp format used across the API (`YYYY-MM-DD HH:MM:SS.ffffff+00`).
///
/// It matches CockroachDB's `now()::text` output, so TEXT ordering stays
/// correct when rows written by either database are mixed.
pub fn now_text() -> String {
    chrono::Utc::now()
        .format("%Y-%m-%d %H:%M:%S%.6f+00")
        .to_string()
}

fn split_statements(sql: &str) -> impl Iterator<Item = &'_ str> + '_ {
    sql.split(';')
        .map(str::trim)
        .filter(|statement| !statement.is_empty())
}

const DSQL_MIGRATIONS: &[(&str, &str)] = &[(
    "0001_community",
    include_str!("../migrations/dsql/0001_community.sql"),
)];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_statements_skips_empty_segments() {
        let statements: Vec<_> =
            split_statements("CREATE TABLE a (id INT);\n\nCREATE INDEX ASYNC b ON a(id);\n")
                .collect();
        assert_eq!(statements.len(), 2);
        assert!(statements[0].starts_with("CREATE TABLE"));
        assert!(statements[1].starts_with("CREATE INDEX"));
    }

    #[test]
    fn now_text_uses_a_sortable_cockroach_format() {
        let value = now_text();
        assert_eq!(value.len(), 29);
        assert!(value.ends_with("+00"));
        assert_eq!(&value[10..11], " ");
        assert_eq!(&value[19..20], ".");
    }
}
