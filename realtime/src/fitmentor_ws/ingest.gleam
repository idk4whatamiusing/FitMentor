import fitmentor_ws/jwt
import gleam/float
import gleam/int
import gleam/list
import gleam/string
import valkyrie

const sm_api = "https://api.supermemory.ai"
const total_sm_pool = 1_000_000

fn user_limit(tier: String) -> Int {
  let pct = case tier {
    "premium" -> 1.0
    "pro" -> 0.7
    _ -> 0.5
  }
  float.round(int.to_float(total_sm_pool) *. pct)
}

fn token_estimate(content: String) -> Int {
  case content {
    "" -> 0
    c -> list.length(string.split(c, " "))
  }
}

fn conn() -> Result(valkyrie.Connection, valkyrie.Error) {
  let url = jwt.env("REDIS_URL")
  let config = case valkyrie.url_config(url) {
    Ok(c) -> c
    Error(_) -> valkyrie.default_config()
  }
  valkyrie.create_connection(config, 2000)
}

fn redis_get(key: String) -> Int {
  case conn() {
    Error(_) -> 0
    Ok(c) -> {
      let n = case valkyrie.get(c, key, 2000) {
        Ok(v) -> {
          case int.parse(v) {
            Ok(n) -> n
            Error(_) -> 0
          }
        }
        Error(_) -> 0
      }
      let _ = valkyrie.shutdown(c, 1000)
      n
    }
  }
}

fn redis_incrby(key: String, amount: Int) {
  case conn() {
    Error(_) -> Nil
    Ok(c) -> {
      let _ = valkyrie.incrby(c, key, amount, 2000)
      let _ = valkyrie.shutdown(c, 1000)
      Nil
    }
  }
}

fn extract_json_string(json: String, key: String) -> String {
  let needle = "\"" <> key <> "\":\""
  case string.split(json, needle) {
    [_, rest, ..] -> {
      case string.split(rest, "\"") {
        [val, ..] -> val
        _ -> ""
      }
    }
    _ -> ""
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

fn call_supermemory(content: String, container_tag: String, sm_key: String) -> Bool {
  let body =
    "{\"content\":\""
    <> escape_json(content)
    <> "\",\"containerTag\":\""
    <> escape_json(container_tag)
    <> "\"}"
  case jwt.http_post_bearer(sm_api <> "/v3/documents", body, sm_key) {
    Ok(#(status, _)) -> status >= 200 && status < 300
    Error(_) -> False
  }
}

pub fn handle(body: String) -> String {
  let sm_key = jwt.env("SUPERMEMORY_API_KEY")
  case sm_key == "" {
    True -> "{\"ok\":false,\"error\":\"SUPERMEMORY_API_KEY not set\"}"
    False -> {
      let container_tag = extract_json_string(body, "container_tag")
      let content = extract_json_string(body, "content")
      let tier = extract_json_string(body, "tier")

      case container_tag == "" || content == "" {
        True -> "{\"ok\":false,\"error\":\"missing required fields\"}"
        False -> {
          let tokens = token_estimate(content)
          let limit = user_limit(tier)
          let used = redis_get("quota:sm:" <> container_tag)

          case used + tokens > limit {
            True ->
              "{\"ok\":false,\"error\":\"Storage limit reached for "
              <> tier
              <> " plan ("
              <> int.to_string(used)
              <> "/"
              <> int.to_string(limit)
              <> " tokens used)\"}"
            False -> {
              case call_supermemory(content, container_tag, sm_key) {
                False ->
                  "{\"ok\":false,\"error\":\"Supermemory ingest failed\"}"
                True -> {
                  redis_incrby("quota:sm:" <> container_tag, tokens)
                  "{\"ok\":true}"
                }
              }
            }
          }
        }
      }
    }
  }
}
