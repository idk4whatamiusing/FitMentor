import fitmentor_ws/community
import fitmentor_ws/ingest
import fitmentor_ws/jwt
import fitmentor_ws/ws_handler
import gleam/bit_array
import gleam/bytes_tree
import gleam/http/request
import gleam/http/response
import gleam/list
import gleam/result
import gleam/http
import gleam/string
import mist

fn handle_community(req: request.Request(BitArray), user_id: String) -> response.Response(mist.ResponseData) {
  let body_str = case bit_array.to_string(req.body) {
    Ok(s) -> s
    Error(_) -> ""
  }
  let result = community.handle(body_str, user_id)
  response.new(200)
  |> response.set_header("content-type", "application/json")
  |> response.set_header("access-control-allow-origin", "*")
  |> response.set_body(mist.Bytes(bytes_tree.from_string(result)))
}

fn handle_ingest(req: request.Request(BitArray)) -> response.Response(mist.ResponseData) {
  let body_str = case bit_array.to_string(req.body) {
    Ok(s) -> s
    Error(_) -> ""
  }
  let result = ingest.handle(body_str)
  response.new(200)
  |> response.set_header("content-type", "application/json")
  |> response.set_body(mist.Bytes(bytes_tree.from_string(result)))
}

pub fn start() -> Result(Nil, Nil) {
  jwt.throttle_init()

  let cors_preflight =
    response.new(200)
    |> response.set_header("access-control-allow-origin", "*")
    |> response.set_header("access-control-allow-methods", "GET, POST, OPTIONS")
    |> response.set_header("access-control-allow-headers", "content-type, authorization")
    |> response.set_body(mist.Bytes(bytes_tree.new()))

  let body_err =
    response.new(400)
    |> response.set_body(mist.Bytes(bytes_tree.new()))

  let not_found =
    response.new(404)
    |> response.set_body(mist.Bytes(bytes_tree.new()))

  let assert Ok(_) =
    fn(req) {
      case request.path_segments(req) {
        ["health"] ->
          response.new(200)
          |> response.set_body(mist.Bytes(bytes_tree.from_string(
            "{\"status\":\"ok\",\"version\":\"1.0.0\"}",
          )))
        ["ws"] -> {
          let token = case request.get_query(req) {
            Ok(params) ->
              case list.key_find(params, "token") {
                Ok(t) -> t
                Error(_) -> ""
              }
            Error(_) -> ""
          }
          mist.websocket(
            request: req,
            on_init: ws_handler.on_init(_, token),
            on_close: ws_handler.on_close,
            handler: ws_handler.handle_message,
          )
        }
        ["v1", "ingest"] ->
          mist.read_body(req, max_body_limit: 1_000_000)
          |> result.map(handle_ingest)
          |> result.lazy_unwrap(fn() { body_err })
        ["v1", "community", "graphql"] ->
          case req.method {
            http.Options -> cors_preflight
            _ -> {
              // extract user_id: try Authorization JWT first, fall back to X-User-Id header (server-to-server)
              let user_id = case request.get_header(req, "authorization") {
                Ok(t) -> {
                  let token = case string.starts_with(t, "Bearer ") {
                    True -> string.drop_start(t, 7)
                    False -> t
                  }
                  let api_key = case request.get_header(req, "x-api-key") {
                    Ok(k) -> k
                    Error(_) -> ""
                  }
                  case api_key == jwt.api_shared_secret() && string.length(api_key) > 0 {
                    True -> {
                      // server-to-server: trust X-User-Id
                      case request.get_header(req, "x-user-id") {
                        Ok(uid) -> uid
                        Error(_) -> ""
                      }
                    }
                    False -> {
                      // client: verify JWT
                      case jwt.verify(token, jwt.jwks_url()) {
                        Ok(uid) -> uid
                        Error(_) -> ""
                      }
                    }
                  }
                }
                Error(_) -> ""
              }
              case string.length(user_id) > 0 {
                True ->
                  mist.read_body(req, max_body_limit: 10_000_000)
                  |> result.map(fn(r) { handle_community(r, user_id) })
                  |> result.lazy_unwrap(fn() { body_err })
                False ->
                  response.new(401)
                  |> response.set_body(mist.Bytes(bytes_tree.from_string(
                    "{\"errors\":[{\"message\":\"unauthorized\"}]}",
                  )))
              }
            }
          }
        _ -> not_found
      }
    }
    |> mist.new
    |> mist.bind("0.0.0.0")
    |> mist.port(8080)
    |> mist.start

  Ok(Nil)
}