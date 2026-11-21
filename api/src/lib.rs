//! FitMentor API — Rust on AWS Lambda.
//!
//! Bindings:
//! - CockroachDB (Postgres wire) for all application data
//! - Cloudflare Pages `/api/ai/complete` for Workers AI generation
//!
//! The Cloudflare Pages front end authenticates users and calls this API
//! server-to-server with `x-api-key` + `x-user-id`.

pub mod app;
pub mod auth;
pub mod config;
pub mod db;
pub mod error;
pub mod handlers;
pub mod models;
