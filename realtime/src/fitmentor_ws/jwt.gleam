import gleam/bit_array
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import valkyrie

pub type AuthError {
  MissingToken
  MalformedToken
  ExpiredToken
  BadSignature
  FetchJwksFailed
  NoMatchingKey
}

// ponytail: no Gleam JWT/JWKS lib exists, so we do a real but minimal RS256
// check against Cloudflare Access JWKS (same approach as the Rust api/src/auth/jwt.rs).

@external(erlang, "fitmentor_ws@jwt_ffi", "urlsafe_b64_decode")
fn erl_b64url_decode(input: String) -> BitArray

@external(erlang, "fitmentor_ws@jwt_ffi", "rsa_verify")
fn erl_rsa_verify(message: BitArray, signature: BitArray, n: String, e: String) -> Bool

@external(erlang, "fitmentor_ws@jwt_ffi", "http_get")
fn erl_http_get(url: String) -> Result(BitArray, String)

@external(erlang, "fitmentor_ws@jwt_ffi", "system_time_seconds")
fn erl_now_seconds() -> Int

@external(erlang, "fitmentor_ws@jwt_ffi", "get_env")
fn erl_get_env(key: String) -> String

@external(erlang, "fitmentor_ws@jwt_ffi", "http_post")
fn erl_http_post(url: String, body: String, headers: List(#(String, String))) -> Result(#(Int, String), String)

@external(erlang, "fitmentor_ws@jwt_ffi", "throttle_init")
pub fn throttle_init() -> Nil

@external(erlang, "fitmentor_ws@jwt_ffi", "throttle_check")
fn erl_throttle_check(user_id: String, minute_bucket: Int, limit: Int) -> Int

@external(erlang, "fitmentor_ws@jwt_ffi", "current_minute_bucket")
fn erl_current_minute_bucket() -> Int

pub fn xadd_coach_log(payload: String) -> Bool {
  let url = erl_get_env("REDIS_URL")
  case url == "" {
    True -> False
    False -> {
      let config = case valkyrie.url_config(url) {
        Ok(c) -> c
        Error(_) -> valkyrie.default_config()
      }
      case valkyrie.create_connection(config, 5000) {
        Error(_) -> False
        Ok(conn) -> {
          let _ = valkyrie.custom(
            conn,
            ["XADD", "stream:coach:logs", "*", "payload", payload],
            5000,
          )
          let _ = valkyrie.shutdown(conn, 1000)
          True
        }
      }
    }
  }
}

/// Read any env var; empty string when unset.
pub fn env(key: String) -> String {
  erl_get_env(key)
}

/// Read CF_JWKS_URL; empty string when unset.
pub fn jwks_url() -> String {
  erl_get_env("CF_JWKS_URL")
}

pub fn api_url() -> String {
  erl_get_env("API_URL")
}

pub fn api_shared_secret() -> String {
  erl_get_env("API_SHARED_SECRET")
}

pub fn cf_account_id() -> String {
  erl_get_env("CF_ACCOUNT_ID")
}

pub fn cf_api_token() -> String {
  erl_get_env("CF_API_TOKEN")
}

pub fn throttle_allowed(user_id: String, tier: String) -> Bool {
  let limit = case tier {
    "premium" -> 20
    "pro" -> 10
    _ -> 5
  }
  erl_throttle_check(user_id, erl_current_minute_bucket(), limit) == 1
}

pub fn http_post_json(url: String, body: String) -> Result(#(Int, String), String) {
  erl_http_post(url, body, [])
}

pub fn http_post_authed(url: String, body: String, api_key: String, user_id: String) -> Result(#(Int, String), String) {
  erl_http_post(url, body, [#("x-api-key", api_key), #("x-user-id", user_id)])
}

pub fn http_post_bearer(url: String, body: String, token: String) -> Result(#(Int, String), String) {
  erl_http_post(url, body, [#("authorization", "Bearer " <> token)])
}

fn b64url_decode(s: String) -> Result(BitArray, Nil) {
  let decoded = erl_b64url_decode(s)
  case bit_array.byte_size(decoded) {
    0 -> Error(Nil)
    _ -> Ok(decoded)
  }
}

/// Decode and verify a Cloudflare Access JWT.
/// `jwks_url` is read from CF_JWKS_URL at the call site.
pub fn verify(token: String, jwks_url: String) -> Result(String, AuthError) {
  let parts = string.split(token, ".")
  case parts {
    [header_b64, payload_b64, sig_b64] -> {
      let signing_input = header_b64 <> "." <> payload_b64
      case b64url_decode(payload_b64) {
        Error(_) -> Error(MalformedToken)
        Ok(payload) ->
          case bit_array.to_string(payload) {
            Error(_) -> Error(MalformedToken)
            Ok(payload_str) -> verify_claims(
              header_b64,
              payload_str,
              signing_input,
              sig_b64,
              jwks_url,
            )
          }
      }
    }
    _ -> Error(MalformedToken)
  }
}

fn verify_claims(
  header_b64: String,
  payload_str: String,
  signing_input: String,
  sig_b64: String,
  jwks_url: String,
) -> Result(String, AuthError) {
  // 1. expiry check
  case extract_exp(payload_str) {
    Error(_) -> Error(MalformedToken)
    Ok(exp) -> {
      let now = erl_now_seconds()
      case exp > now {
        False -> Error(ExpiredToken)
        True -> {
          // 2. signature check against JWKS
          case verify_signature(header_b64, signing_input, sig_b64, jwks_url) {
            Ok(True) -> {
              case extract_sub(payload_str) {
                Ok(sub) -> Ok(sub)
                Error(_) -> Error(MalformedToken)
              }
            }
            Ok(False) -> Error(BadSignature)
            Error(e) -> Error(e)
          }
        }
      }
    }
  }
}

fn verify_signature(
  header_b64: String,
  signing_input: String,
  sig_b64: String,
  jwks_url: String,
) -> Result(Bool, AuthError) {
  case b64url_decode(header_b64) {
    Error(_) -> Error(MalformedToken)
    Ok(header) ->
      case bit_array.to_string(header) {
        Error(_) -> Error(MalformedToken)
        Ok(header_str) -> {
          let kid = extract_string_claim(header_str, "kid")
          case b64url_decode(sig_b64) {
            Error(_) -> Error(MalformedToken)
            Ok(sig) -> {
              let input_ba = bit_array.from_string(signing_input)
              case kid {
                Error(_) -> Error(MalformedToken)
                Ok(kid_str) -> verify_with_jwks(
                  input_ba,
                  sig,
                  kid_str,
                  jwks_url,
                )
              }
            }
          }
        }
      }
  }
}

fn verify_with_jwks(
  input_ba: BitArray,
  sig: BitArray,
  kid_str: String,
  jwks_url: String,
) -> Result(Bool, AuthError) {
  case erl_http_get(jwks_url) {
    Error(_) -> Error(FetchJwksFailed)
    Ok(jwks_ba) -> {
      case bit_array.to_string(jwks_ba) {
        Error(_) -> Error(FetchJwksFailed)
        Ok(jwks_str) ->
          case find_jwk_n_e(jwks_str, kid_str) {
            None -> Error(NoMatchingKey)
            Some(#(n, e)) -> Ok(erl_rsa_verify(input_ba, sig, n, e))
          }
      }
    }
  }
}

/// Pull the "keys" array from JWKS JSON, find the one whose kid matches,
/// return its n/e (base64url). Naive flat scan — JWKS JSON is small & stable.
fn find_jwk_n_e(jwks: String, kid: String) -> Option(#(String, String)) {
  let keys = extract_array_block(jwks, "keys")
  case keys {
    "" -> None
    block -> scan_keys(block, kid)
  }
}

fn scan_keys(block: String, kid: String) -> Option(#(String, String)) {
  // split into per-key objects on "kid"
  let chunks = string.split(block, "\"kid\"")
  case chunks {
    [] -> None
    [_first, ..rest] -> {
      case find_first(rest, kid) {
        Some(ne) -> Some(ne)
        None -> None
      }
    }
  }
}

fn find_first(chunks: List(String), kid: String) -> Option(#(String, String)) {
  case chunks {
    [] -> None
    [c, ..rest] -> {
      let this_kid = extract_quoted_after(c)
      case this_kid == kid {
        True -> {
          let n = extract_string_claim(c, "n")
          let e = extract_string_claim(c, "e")
          case n, e {
            Ok(nv), Ok(ev) -> Some(#(nv, ev))
            _, _ -> None
          }
        }
        False -> find_first(rest, kid)
      }
    }
  }
}

fn extract_array_block(json: String, key: String) -> String {
  let needle = "\"" <> key <> "\":["
  case string.split(json, needle) {
    [_, rest, ..] ->
      case string.split(rest, "]") {
        [arr, ..] -> arr
        [] -> ""
      }
    _ -> ""
  }
}

fn extract_quoted_after(s: String) -> String {
  case string.split(s, ":") {
    [_, rest, ..] -> {
      let trimmed = string.trim(rest)
      case string.starts_with(trimmed, "\"") {
        True -> {
          case string.split(trimmed, "\"") {
            [_, val, ..] -> val
            _ -> ""
          }
        }
        False -> ""
      }
    }
    _ -> ""
  }
}

fn extract_string_claim(json: String, key: String) -> Result(String, Nil) {
  let needle = "\"" <> key <> "\":\""
  case string.split(json, needle) {
    [_, rest, ..] -> {
      case string.split(rest, "\"") {
        [val, ..] -> Ok(val)
        [] -> Error(Nil)
      }
    }
    _ -> Error(Nil)
  }
}

fn extract_sub(payload: String) -> Result(String, Nil) {
  extract_string_claim(payload, "sub")
}

fn extract_exp(payload: String) -> Result(Int, Nil) {
  let needle = "\"exp\":"
  case string.split(payload, needle) {
    [_, rest, ..] -> {
      let digits =
        string.to_graphemes(string.trim(rest))
        |> list.take_while(fn(c) { is_digit(c) })
        |> string.concat
      case int.parse(digits) {
        Ok(n) -> Ok(n)
        Error(_) -> Error(Nil)
      }
    }
    _ -> Error(Nil)
  }
}

fn is_digit(c: String) -> Bool {
  case c {
    "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" -> True
    _ -> False
  }
}

/// Map an AuthError to a human readable code for the error frame.
pub fn error_code(err: AuthError) -> String {
  case err {
    MissingToken -> "missing_token"
    MalformedToken -> "malformed_token"
    ExpiredToken -> "expired_token"
    BadSignature -> "bad_signature"
    FetchJwksFailed -> "jwks_unavailable"
    NoMatchingKey -> "no_matching_key"
  }
}
