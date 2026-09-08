import fitmentor_ws/jwt
import gleam/io
import gleam/list
import gleam/option.{None}
import gleam/string
import mist.{type WebsocketConnection, type WebsocketMessage}
import gleam/erlang/process

pub type WsState {
  WsState(
    user_id: String,
    conn: WebsocketConnection,
    subscriptions: List(String),
    authenticated: Bool,
  )
}

pub type WsMessage {
  Broadcast(String)
}

pub fn on_init(
  conn: WebsocketConnection,
  token: String,
) -> #(WsState, option.Option(process.Selector(WsMessage))) {
  // ponytail: CF_JWKS_URL must be set in the environment (same certs endpoint
  // as the Rust API: https://<team-domain>/cdn-cgi/access/certs).
  let jwks_url = jwt.jwks_url()

  let state = WsState(
    user_id: "",
    conn: conn,
    subscriptions: [],
    authenticated: False,
  )

  case string.length(token) > 0, string.length(jwks_url) > 0 {
    True, True -> {
      case jwt.verify(token, jwks_url) {
        Ok(sub) -> {
          let authed =
            WsState(..state, user_id: sub, authenticated: True)
          io.println("Authenticated connection: " <> sub)
          #(authed, None)
        }
        Error(err) -> {
          let code = jwt.error_code(err)
          io.println("WS auth rejected: " <> code)
          let _ = mist.send_text_frame(
            conn,
            "{\"type\":\"error\",\"code\":\"auth_failed\",\"message\":\""
              <> code
              <> "\"}",
          )
          // Return unauthenticated state; the first incoming message will be
          // rejected and close the connection (see handle_text).
          #(state, None)
        }
      }
    }
    _, _ -> {
      io.println("WS auth rejected: missing token or CF_JWKS_URL")
      let _ = mist.send_text_frame(
        conn,
        "{\"type\":\"error\",\"code\":\"auth_required\",\"message\":\"token query param and CF_JWKS_URL required\"}",
      )
      #(state, None)
    }
  }
}

pub fn on_close(state: WsState) -> Nil {
  io.println("Client disconnected: " <> state.user_id)
  Nil
}

pub fn handle_message(
  state: WsState,
  message: WebsocketMessage(WsMessage),
  conn: WebsocketConnection,
) -> mist.Next(WsState, WsMessage) {
  case message {
    mist.Text(msg) -> handle_text(state, conn, msg)
    mist.Binary(_) -> mist.continue(state)
    mist.Closed | mist.Shutdown -> {
      io.println("Connection closed: " <> state.user_id)
      mist.stop()
    }
    mist.Custom(Broadcast(text)) -> {
      let _ = mist.send_text_frame(conn, text)
      mist.continue(state)
    }
  }
}

fn handle_text(
  state: WsState,
  conn: WebsocketConnection,
  msg: String,
) -> mist.Next(WsState, WsMessage) {
  // Require auth via an `auth` message carrying a `token` if not already
  // authenticated through the upgrade handshake.
  case state.authenticated {
    False -> {
      let msg_type = extract_json_string(msg, "type")
      case msg_type {
        "auth" -> {
          let token = extract_json_string(msg, "token")
          case string.length(token) > 0 {
            False -> reject(conn, "missing_token")
            True -> {
              let jwks_url = jwt.jwks_url()
              case string.length(jwks_url) > 0 {
                False -> reject(conn, "jwks_unavailable")
                True -> {
                  case jwt.verify(token, jwks_url) {
                    Ok(sub) -> {
                      io.println("Authenticated via message: " <> sub)
                      let _ = mist.send_text_frame(
                        conn,
                        "{\"type\":\"authenticated\",\"user_id\":\""
                          <> sub
                          <> "\"}",
                      )
                      mist.continue(WsState(
                        ..state,
                        user_id: sub,
                        authenticated: True,
                        conn: conn,
                      ))
                    }
                    Error(err) -> reject(conn, jwt.error_code(err))
                  }
                }
              }
            }
          }
        }
        _ -> reject(conn, "auth_required")
      }
    }
    True -> handle_authed(state, conn, msg)
  }
}

fn reject(conn: WebsocketConnection, code: String) -> mist.Next(WsState, WsMessage) {
  let _ = mist.send_text_frame(
    conn,
    "{\"type\":\"error\",\"code\":\"auth_failed\",\"message\":\""
      <> code
      <> "\"}",
  )
  mist.stop()
}

fn handle_authed(
  state: WsState,
  conn: WebsocketConnection,
  msg: String,
) -> mist.Next(WsState, WsMessage) {
  let msg_type = extract_json_string(msg, "type")
  case msg_type {
    "ping" -> {
      let _ = mist.send_text_frame(conn, "{\"type\":\"pong\"}")
      mist.continue(state)
    }
    "subscribe" -> {
      let channels = extract_json_string_array(msg, "channels")
      let new_subs = list.append(state.subscriptions, channels)
      let new_state = WsState(..state, subscriptions: new_subs, conn: conn)
      let channel_list = string.join(channels, ",")
      let resp =
        "{\"type\":\"subscribed\",\"channels\":[\""
        <> channel_list
        <> "\"]}"
      let _ = mist.send_text_frame(conn, resp)
      io.println(
        "User " <> state.user_id <> " subscribed to: " <> channel_list,
      )
      mist.continue(new_state)
    }
    "unsubscribe" -> {
      let channels = extract_json_string_array(msg, "channels")
      let new_subs =
        list.filter(state.subscriptions, fn(s) {
          !list.contains(channels, s)
        })
      let new_state = WsState(..state, subscriptions: new_subs, conn: conn)
      let resp = "{\"type\":\"unsubscribed\"}"
      let _ = mist.send_text_frame(conn, resp)
      mist.continue(new_state)
    }
    "presence" -> {
      let status = extract_json_string(msg, "status")
      io.println("User " <> state.user_id <> " presence: " <> status)
      mist.continue(state)
    }
    "chat" -> {
      handle_chat(state, conn, msg)
    }
    _ -> {
      let resp =
        "{\"type\":\"error\",\"code\":\"invalid_message\",\"message\":\"Unknown message type\"}"
      let _ = mist.send_text_frame(conn, resp)
      mist.continue(state)
    }
  }
}

fn handle_chat(
  state: WsState,
  conn: WebsocketConnection,
  msg: String,
) -> mist.Next(WsState, WsMessage) {
  let ai_body = extract_json_string(msg, "ai_request")
  let last_message = extract_json_string(msg, "last_message")
  let tier = extract_json_string(msg, "tier")
  let msgs = extract_json_string(msg, "messages")
  let session_id = extract_json_string(msg, "session_id")

  case jwt.throttle_allowed(state.user_id, tier) {
    False -> {
      let _ = mist.send_text_frame(
        conn,
        "{\"type\":\"chat_error\",\"message\":\"Too many requests — please wait.\"}",
      )
      mist.continue(state)
    }
    True -> {
      let api_url = jwt.api_url()
      let api_key = jwt.api_shared_secret()
      let quota_url = api_url <> "/v1/internal/quota/check-and-consume"
      let quota_body =
        "{\"tier\":\"" <> escape_json(tier) <> "\"}"

      case jwt.http_post_authed(quota_url, quota_body, api_key, state.user_id) {
        Error(_) -> {
          let _ = mist.send_text_frame(
            conn,
            "{\"type\":\"chat_error\",\"message\":\"Quota service unavailable.\"}",
          )
          mist.continue(state)
        }
        Ok(#(_, quota_resp)) -> {
          case extract_json_string(quota_resp, "allowed") {
            "true" -> call_ai(state, conn, ai_body, msgs, last_message, tier, session_id)
            _ -> {
              let limit = extract_json_string(quota_resp, "limit")
              let used = extract_json_string(quota_resp, "used")
              let err =
                "{\"type\":\"chat_error\",\"message\":\"AI daily limit reached ("
                <> used
                <> "/"
                <> limit
                <> " tokens).\"}"
              let _ = mist.send_text_frame(conn, err)
              mist.continue(state)
            }
          }
        }
      }
    }
  }
}

fn call_ai(
  state: WsState,
  conn: WebsocketConnection,
  ai_body: String,
  msgs: String,
  last_message: String,
  tier: String,
  session_id: String,
) -> mist.Next(WsState, WsMessage) {
  let cf_account = jwt.cf_account_id()
  let cf_token = jwt.cf_api_token()
  let ai_url =
    "https://api.cloudflare.com/client/v4/accounts/"
    <> cf_account
    <> "/ai/run/@cf/meta/llama-4-scout-17b-16e-instruct"

  case jwt.http_post_bearer(ai_url, ai_body, cf_token) {
    Error(_) -> {
      let _ = mist.send_text_frame(
        conn,
        "{\"type\":\"chat_error\",\"message\":\"AI unavailable — try again.\"}",
      )
      mist.continue(state)
    }
    Ok(#(_, ai_resp)) -> {
      let content =
        case extract_json_string(ai_resp, "content") {
          "" -> extract_json_string(ai_resp, "response")
          c -> c
        }
      let safe = escape_json(content)
      let resp = "{\"type\":\"chat_response\",\"content\":\"" <> safe <> "\"}"
      let _ = mist.send_text_frame(conn, resp)

      // Coach log (fire and forget, direct to Redis Streams)
      let log_body =
        "{\"messages\":"
        <> msgs
        <> ",\"user_message\":\""
        <> escape_json(last_message)
        <> "\",\"reply\":\""
        <> safe
        <> "\",\"container_tag\":\""
        <> state.user_id
        <> "\",\"user_id\":\""
        <> state.user_id
        <> "\",\"tier\":\""
        <> escape_json(tier)
        <> "\",\"session_id\":\""
        <> escape_json(session_id)
        <> "\"}"
      let _ = jwt.xadd_coach_log(log_body)

      mist.continue(state)
    }
  }
}

fn escape_json(s: String) -> String {
  s
  |> string.replace("\\", "\\\\")
  |> string.replace("\"", "\\\"")
  |> string.replace("\n", "\\n")
  |> string.replace("\r", "\\r")
  |> string.replace("\t", "\\t")
}

/// Extract a string value from a flat JSON object: {"key":"value"}
/// Handles escaped quotes (\") inside the value.
/// Ponytail: works for our message types, no nesting needed.
fn extract_json_string(json: String, key: String) -> String {
  let needle = "\"" <> key <> "\":\""
  case string.split(json, needle) {
    [_, rest, ..] -> {
      let chars = string.to_graphemes(rest)
      scan_json_string(chars, "")
    }
    _ -> ""
  }
}

fn scan_json_string(chars: List(String), acc: String) -> String {
  case chars {
    [] -> acc
    ["\\", c, ..rest] -> scan_json_string(rest, acc <> "\\" <> c)
    ["\"", ..] -> acc
    [c, ..rest] -> scan_json_string(rest, acc <> c)
  }
}

/// Extract a string array from JSON: {"channels":["a","b"]}
/// Handles escaped quotes and commas inside quoted elements.
fn extract_json_string_array(json: String, key: String) -> List(String) {
  let needle = "\"" <> key <> "\":["
  case string.split(json, needle) {
    [_, rest, ..] -> {
      case string.split(rest, "]") {
        [arr_content, ..] -> parse_json_array(string.to_graphemes(arr_content), "", [])
        [] -> []
      }
    }
    _ -> []
  }
}

fn parse_json_array(
  chars: List(String),
  cur: String,
  acc: List(String),
) -> List(String) {
  case chars {
    [] -> finish_element(cur, acc)
    ["\\", c, ..rest] -> parse_json_array(rest, cur <> "\\" <> c, acc)
    ["\"", ..rest] -> {
      let #(val, rem) = read_quoted(rest, "")
      parse_json_array(rem, val, acc)
    }
    [",", ..rest] -> parse_json_array(rest, "", finish_element(cur, acc))
    [" ", "\t", "\n", "\r", ..rest] -> parse_json_array(rest, cur, acc)
    [c, ..rest] -> parse_json_array(rest, cur <> c, acc)
  }
}

fn read_quoted(chars: List(String), acc: String) -> #(String, List(String)) {
  case chars {
    [] -> #(acc, [])
    ["\\", c, ..rest] -> read_quoted(rest, acc <> "\\" <> c)
    ["\"", ..rest] -> #(acc, rest)
    [c, ..rest] -> read_quoted(rest, acc <> c)
  }
}

fn finish_element(cur: String, acc: List(String)) -> List(String) {
  let trimmed = string.trim(cur)
  case string.length(trimmed) > 0 {
    True -> list.append(acc, [trimmed])
    False -> acc
  }
}
