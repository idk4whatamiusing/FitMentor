//! CockroachDB (Postgres wire) connection pool.
//!
//! The cluster certificate is embedded in the binary and written to `/tmp` on
//! cold start so the deployment package stays a single `bootstrap` executable.

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
