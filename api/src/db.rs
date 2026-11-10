//! D1 helpers. D1 is SQLite; ids are TEXT, JSON is TEXT.

use serde::de::DeserializeOwned;
use wasm_bindgen::JsValue;
use worker::*;

pub fn js(s: &str) -> JsValue {
    JsValue::from_str(s)
}

pub fn js_opt(s: Option<&str>) -> JsValue {
    match s {
        Some(v) => JsValue::from_str(v),
        None => JsValue::NULL,
    }
}

pub fn js_num(n: i64) -> JsValue {
    JsValue::from_f64(n as f64)
}

pub fn js_opt_num(n: Option<i64>) -> JsValue {
    match n {
        Some(v) => JsValue::from_f64(v as f64),
        None => JsValue::NULL,
    }
}

pub fn js_opt_f64(n: Option<f64>) -> JsValue {
    match n {
        Some(v) => JsValue::from_f64(v),
        None => JsValue::NULL,
    }
}

pub fn js_bool(b: bool) -> JsValue {
    JsValue::from_bool(b)
}

/// Fetch a single row, mapping "no rows" to Ok(None).
pub async fn first<T: DeserializeOwned>(
    db: &D1Database,
    sql: &str,
    binds: &[JsValue],
) -> Result<Option<T>> {
    let stmt = db.prepare(sql);
    let stmt = if binds.is_empty() {
        stmt
    } else {
        stmt.bind(binds)?
    };
    stmt.first::<T>(None).await
}

/// Fetch all rows.
pub async fn all<T: DeserializeOwned>(
    db: &D1Database,
    sql: &str,
    binds: &[JsValue],
) -> Result<Vec<T>> {
    let stmt = db.prepare(sql);
    let stmt = if binds.is_empty() {
        stmt
    } else {
        stmt.bind(binds)?
    };
    let result = stmt.all().await?;
    result.results::<T>()
}

/// Execute a write; returns rows written.
pub async fn run(db: &D1Database, sql: &str, binds: &[JsValue]) -> Result<u64> {
    let stmt = db.prepare(sql);
    let stmt = if binds.is_empty() {
        stmt
    } else {
        stmt.bind(binds)?
    };
    let result = stmt.run().await?;
    Ok(result.meta()?.and_then(|m| m.changes).unwrap_or(0) as u64)
}

pub fn db(env: &Env) -> Result<D1Database> {
    env.d1("DB")
}
