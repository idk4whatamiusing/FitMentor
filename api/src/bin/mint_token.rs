//! Dev-only helper: mint a mobile JWT for the Slint app.
//!
//! Usage:
//!   set -a && . .env && set +a
//!   cargo run --bin mint-token -- google:123 you@example.com

use fitmentor_api::{auth, config::Config};

fn main() -> Result<(), String> {
    let mut args = std::env::args().skip(1);
    let sub = args
        .next()
        .ok_or_else(|| "usage: mint-token <sub> <email>".to_string())?;
    let email = args
        .next()
        .ok_or_else(|| "usage: mint-token <sub> <email>".to_string())?;
    let config = Config::from_env()?;
    let token = auth::issue_token(&config, &sub, &email).map_err(|error| format!("{error:?}"))?;
    println!("{token}");
    Ok(())
}
