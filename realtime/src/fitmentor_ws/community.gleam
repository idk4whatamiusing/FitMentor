import fitmentor_ws/jwt
import gleam/int
import gleam/list
import gleam/result
import gleam/string

// ── Erlang FFI declarations ────────────────────────────────────────

@external(erlang, "fitmentor_ws@community_db_ffi", "connect")
fn db_connect(url: String) -> Result(Dynamic, String)

@external(erlang, "fitmentor_ws@community_db_ffi", "query")
fn db_query(
  conn: Dynamic,
  sql: String,
  params: List(String),
) -> Result(List(Dynamic), String)

@external(erlang, "fitmentor_ws@community_db_ffi", "row_field")
fn row_field(row: Dynamic, key: String) -> String

@external(erlang, "fitmentor_ws@community_db_ffi", "row_count")
fn row_count(rows: List(Dynamic)) -> Int

@external(erlang, "fitmentor_ws@community_r2_ffi", "presign_put")
fn r2_presign_put(
  bucket: String,
  key: String,
  access_key: String,
  secret_key: String,
  region: String,
  host: String,
) -> String

pub type Dynamic

// ── config helpers ─────────────────────────────────────────────────

fn db_url() -> String { jwt.env("DATABASE_URL") }
fn r2_bucket() -> String { jwt.env("R2_BUCKET") }
fn r2_access_key() -> String { jwt.env("R2_ACCESS_KEY_ID") }
fn r2_secret_key() -> String { jwt.env("R2_SECRET_ACCESS_KEY") }
fn r2_region() -> String {
  let r = jwt.env("R2_REGION")
  case string.is_empty(r) {
    True -> "auto"
    False -> r
  }
}
fn r2_host() -> String { jwt.env("R2_HOST") }

fn json_esc(s: String) -> String {
  s
  |> string.replace("\\", "\\\\")
  |> string.replace("\"", "\\\"")
  |> string.replace("\n", "\\n")
  |> string.replace("\r", "\\r")
  |> string.replace("\t", "\\t")
}

fn bool_str(b: Bool) -> String {
  case b {
    True -> "true"
    False -> "false"
  }
}

fn row_bool(row: Dynamic, key: String) -> Bool {
  let v = row_field(row, key)
  v == "true" || v == "1"
}

fn row_int(row: Dynamic, key: String) -> Int {
  row_field(row, key) |> int.parse |> result.unwrap(0)
}

fn row_str(row: Dynamic, key: String) -> String {
  row_field(row, key)
}

// ── types ──────────────────────────────────────────────────────────

pub type Post {
  Post(
    id: String,
    user_id: String,
    body: String,
    parent_id: String,
    reshare_id: String,
    hidden: Bool,
    created_at: String,
    like_count: Int,
    liked_by_me: Bool,
    reply_count: Int,
    reshare_count: Int,
    author_name: String,
  )
}

pub type Notification {
  Notification(
    id: String,
    actor_id: String,
    post_id: String,
    type_: String,
    read: Bool,
    created_at: String,
  )
}

// ── serialization ──────────────────────────────────────────────────

fn post_to_json(p: Post) -> String {
  "{\"id\":\"" <> json_esc(p.id)
  <> "\",\"user_id\":\"" <> json_esc(p.user_id)
  <> "\",\"body\":" <> p.body
  <> ",\"parent_id\":\"" <> json_esc(p.parent_id)
  <> "\",\"reshare_id\":\"" <> json_esc(p.reshare_id)
  <> "\",\"hidden\":" <> bool_str(p.hidden)
  <> ",\"created_at\":\"" <> json_esc(p.created_at)
  <> "\",\"like_count\":" <> int.to_string(p.like_count)
  <> ",\"liked_by_me\":" <> bool_str(p.liked_by_me)
  <> ",\"reply_count\":" <> int.to_string(p.reply_count)
  <> ",\"reshare_count\":" <> int.to_string(p.reshare_count)
  <> ",\"author_name\":\"" <> json_esc(p.author_name) <> "\"}"
}

fn notif_to_json(n: Notification) -> String {
  "{\"id\":\"" <> json_esc(n.id)
  <> "\",\"actor_id\":\"" <> json_esc(n.actor_id)
  <> "\",\"post_id\":\"" <> json_esc(n.post_id)
  <> "\",\"type\":\"" <> json_esc(n.type_)
  <> "\",\"read\":" <> bool_str(n.read)
  <> ",\"created_at\":\"" <> json_esc(n.created_at) <> "\"}"
}

fn parse_post(row: Dynamic) -> Post {
  Post(
    id: row_str(row, "id"),
    user_id: row_str(row, "user_id"),
    body: row_str(row, "body"),
    parent_id: row_str(row, "parent_id"),
    reshare_id: row_str(row, "reshare_id"),
    hidden: row_bool(row, "hidden"),
    created_at: row_str(row, "created_at"),
    like_count: row_int(row, "like_count"),
    liked_by_me: row_bool(row, "liked_by_me"),
    reply_count: row_int(row, "reply_count"),
    reshare_count: row_int(row, "reshare_count"),
    author_name: row_str(row, "author_name"),
  )
}

fn get_user_name(uid: String) -> String {
  case db_connect(db_url()) {
    Error(_) -> "User"
    Ok(conn) ->
      case db_query(conn, "SELECT name FROM users WHERE cf_access_sub = $1", [uid]) {
        Ok(rows) ->
          case list.first(rows) {
            Ok(row) ->
              case row_str(row, "name") {
                "" -> "User"
                name -> name
              }
            Error(_) -> "User"
          }
        Error(_) -> "User"
      }
  }
}

fn ok(data: String) -> String { "{\"data\":{" <> data <> "}}" }
fn err(msg: String) -> String { "{\"errors\":[{\"message\":\"" <> json_esc(msg) <> "\"}]}" }

fn feed_base() -> String {
  "SELECT p.*, "
  <> "(SELECT COUNT(*) FROM community_likes WHERE post_id = p.id) AS like_count, "
  <> "(SELECT COUNT(*) FROM community_likes WHERE post_id = p.id AND user_id = $1) AS liked_by_me, "
  <> "(SELECT COUNT(*) FROM community_posts WHERE parent_id = p.id) AS reply_count, "
  <> "(SELECT COUNT(*) FROM community_posts WHERE reshare_id = p.id) AS reshare_count, "
  <> "(SELECT COALESCE(u.name, 'User') FROM users u WHERE u.cf_access_sub = p.user_id) AS author_name "
  <> "FROM community_posts p "
}

// ── entry point ────────────────────────────────────────────────────

pub fn handle(body: String, user_id: String) -> String {
  let op = extract_op_name(body)
  let vars = extract_variables(body)
  case op {
    "feed" -> h_feed(vars, user_id)
    "post" -> h_post_detail(vars, user_id)
    "myPosts" -> h_my_posts(vars, user_id)
    "search" -> h_search(vars, user_id)
    "notifications" -> h_notifications(vars, user_id)
    "unreadNotificationCount" -> h_unread_count(user_id)
    "createPost" -> h_create_post(vars, user_id)
    "deletePost" -> h_delete_post(vars, user_id)
    "toggleLike" -> h_toggle_like(vars, user_id)
    "replyToPost" -> h_reply(vars, user_id)
    "resharePost" -> h_reshare(vars, user_id)
    "requestUploadUrl" -> h_upload_url(vars)
    "markNotificationsRead" -> h_mark_read(user_id)
    "markAllNotificationsRead" -> h_mark_all_read(user_id)
    "reportPost" -> h_report(vars, user_id)
    "blockUser" -> h_block(vars, user_id)
    "unblockUser" -> h_unblock(vars, user_id)
    _ -> err("unknown_operation: " <> op)
  }
}

// ── queries ────────────────────────────────────────────────────────

fn h_feed(vars: String, user_id: String) -> String {
  let limit = extract_var_int(vars, "limit", 20)
  case db_connect(db_url()) {
    Error(_) -> err("database_unavailable")
    Ok(conn) -> {
      let sql = feed_base()
        <> "WHERE p.parent_id IS NULL AND p.hidden = false "
        <> "AND p.user_id NOT IN (SELECT blocked_id FROM community_blocks WHERE blocker_id = $1) "
        <> "AND p.user_id NOT IN (SELECT blocker_id FROM community_blocks WHERE blocked_id = $1) "
        <> "ORDER BY p.created_at DESC LIMIT $2"
      case db_query(conn, sql, [user_id, int.to_string(limit)]) {
        Ok(rows) -> {
          let jsons = list.map(rows, fn(r) { parse_post(r) |> post_to_json })
          ok("\"feed\":[" <> string.join(jsons, ",") <> "]")
        }
        Error(e) -> err("query_failed: " <> e)
      }
    }
  }
}

fn h_post_detail(vars: String, user_id: String) -> String {
  let post_id = extract_var_string(vars, "id")
  case db_connect(db_url()) {
    Error(_) -> err("database_unavailable")
    Ok(conn) -> {
      let sql = feed_base() <> "WHERE p.id = $2 AND p.hidden = false"
      case db_query(conn, sql, [user_id, post_id]) {
        Ok(rows) ->
          case list.first(rows) {
            Ok(row) -> {
              let post = parse_post(row)
              let replies_sql = "SELECT p.*, "
                <> "(SELECT COUNT(*) FROM community_likes WHERE post_id = p.id) AS like_count, "
                <> "(SELECT COUNT(*) FROM community_likes WHERE post_id = p.id AND user_id = $1) AS liked_by_me, "
                <> "0 AS reply_count, 0 AS reshare_count, "
                <> "(SELECT COALESCE(u.name, 'User') FROM users u WHERE u.cf_access_sub = p.user_id) AS author_name "
                <> "FROM community_posts p WHERE p.parent_id = $2 AND p.hidden = false "
                <> "ORDER BY p.created_at ASC LIMIT 50"
              let replies_json = case db_query(conn, replies_sql, [user_id, post_id]) {
                Ok(rr) -> {
                  let js = list.map(rr, fn(r) { parse_post(r) |> post_to_json })
                  "[" <> string.join(js, ",") <> "]"
                }
                Error(_) -> "[]"
              }
              ok("\"post\":" <> post_to_json(post) <> ",\"replies\":" <> replies_json)
            }
            Error(_) -> err("post_not_found")
          }
        Error(e) -> err("query_failed: " <> e)
      }
    }
  }
}

fn h_my_posts(vars: String, user_id: String) -> String {
  let limit = extract_var_int(vars, "limit", 20)
  case db_connect(db_url()) {
    Error(_) -> err("database_unavailable")
    Ok(conn) -> {
      let sql = feed_base() <> "WHERE p.user_id = $1 AND p.parent_id IS NULL ORDER BY p.created_at DESC LIMIT $2"
      case db_query(conn, sql, [user_id, int.to_string(limit)]) {
        Ok(rows) -> {
          let jsons = list.map(rows, fn(r) { parse_post(r) |> post_to_json })
          ok("\"myPosts\":[" <> string.join(jsons, ",") <> "]")
        }
        Error(e) -> err("query_failed: " <> e)
      }
    }
  }
}

fn h_search(vars: String, user_id: String) -> String {
  let query = extract_var_string(vars, "query")
  let limit = extract_var_int(vars, "limit", 20)
  case db_connect(db_url()) {
    Error(_) -> err("database_unavailable")
    Ok(conn) -> {
      let sql = feed_base()
        <> "WHERE p.parent_id IS NULL AND p.hidden = false "
        <> "AND to_tsvector('english', p.body->>'text') @@ plainto_tsquery('english', $2) "
        <> "AND p.user_id NOT IN (SELECT blocked_id FROM community_blocks WHERE blocker_id = $1) "
        <> "ORDER BY p.created_at DESC LIMIT $3"
      case db_query(conn, sql, [user_id, query, int.to_string(limit)]) {
        Ok(rows) -> {
          let jsons = list.map(rows, fn(r) { parse_post(r) |> post_to_json })
          ok("\"search\":[" <> string.join(jsons, ",") <> "]")
        }
        Error(e) -> err("query_failed: " <> e)
      }
    }
  }
}

fn h_notifications(vars: String, user_id: String) -> String {
  let limit = extract_var_int(vars, "limit", 20)
  case db_connect(db_url()) {
    Error(_) -> err("database_unavailable")
    Ok(conn) -> {
      let sql = "SELECT id, actor_id, post_id::text, type, read, created_at "
        <> "FROM community_notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2"
      case db_query(conn, sql, [user_id, int.to_string(limit)]) {
        Ok(rows) -> {
          let jsons = list.map(rows, fn(r) {
            Notification(
              id: row_str(r, "id"),
              actor_id: row_str(r, "actor_id"),
              post_id: row_str(r, "post_id"),
              type_: row_str(r, "type"),
              read: row_bool(r, "read"),
              created_at: row_str(r, "created_at"),
            ) |> notif_to_json
          })
          ok("\"notifications\":[" <> string.join(jsons, ",") <> "]")
        }
        Error(e) -> err("query_failed: " <> e)
      }
    }
  }
}

fn h_unread_count(user_id: String) -> String {
  case db_connect(db_url()) {
    Error(_) -> err("database_unavailable")
    Ok(conn) -> {
      case db_query(conn, "SELECT COUNT(*) AS cnt FROM community_notifications WHERE user_id = $1 AND read = false", [user_id]) {
        Ok(rows) ->
          case list.first(rows) {
            Ok(r) -> ok("\"unreadNotificationCount\":" <> int.to_string(row_int(r, "cnt")))
            Error(_) -> ok("\"unreadNotificationCount\":0")
          }
        Error(e) -> err("query_failed: " <> e)
      }
    }
  }
}

// ── mutations ──────────────────────────────────────────────────────

fn h_create_post(vars: String, user_id: String) -> String {
  let text = extract_var_string(vars, "text")
  let media = extract_var_raw(vars, "media", "[]")
  let body_json = "{\"text\":\"" <> json_esc(text) <> "\",\"media\":" <> media <> "}"
  let name = get_user_name(user_id)
  case db_connect(db_url()) {
    Error(_) -> err("database_unavailable")
    Ok(conn) -> {
      case db_query(conn,
        "INSERT INTO community_posts (id, user_id, body) VALUES (gen_random_uuid(), $1, $2::jsonb) RETURNING id, created_at",
        [user_id, body_json],
      ) {
        Ok(rows) ->
          case list.first(rows) {
            Ok(row) -> {
              let post = Post(
                id: row_str(row, "id"), user_id: user_id, body: body_json,
                parent_id: "", reshare_id: "", hidden: False,
                created_at: row_str(row, "created_at"),
                like_count: 0, liked_by_me: False, reply_count: 0, reshare_count: 0,
                author_name: name,
              )
              ok("\"createPost\":" <> post_to_json(post))
            }
            Error(_) -> err("insert_failed")
          }
        Error(e) -> err("query_failed: " <> e)
      }
    }
  }
}

fn h_delete_post(vars: String, user_id: String) -> String {
  let post_id = extract_var_string(vars, "id")
  case db_connect(db_url()) {
    Error(_) -> err("database_unavailable")
    Ok(conn) ->
      case db_query(conn, "DELETE FROM community_posts WHERE id = $1 AND user_id = $2", [post_id, user_id]) {
        Ok(_) -> ok("\"deletePost\":true")
        Error(e) -> err("query_failed: " <> e)
      }
  }
}

fn h_toggle_like(vars: String, user_id: String) -> String {
  let post_id = extract_var_string(vars, "postId")
  case db_connect(db_url()) {
    Error(_) -> err("database_unavailable")
    Ok(conn) -> {
      case db_query(conn, "SELECT 1 FROM community_likes WHERE post_id = $1 AND user_id = $2", [post_id, user_id]) {
        Ok(rows) ->
          case row_count(rows) {
            0 -> {
              // like
              let _ = db_query(conn, "INSERT INTO community_likes (post_id, user_id) VALUES ($1, $2)", [post_id, user_id])
              // notify
              case db_query(conn, "SELECT user_id FROM community_posts WHERE id = $1", [post_id]) {
                Ok(or) ->
                  case list.first(or) {
                    Ok(o) -> {
                      let oid = row_str(o, "user_id")
                      case oid == user_id {
                        True -> Nil
                        False -> {
                          let _ = db_query(conn,
                            "INSERT INTO community_notifications (id, user_id, actor_id, post_id, type) VALUES (gen_random_uuid(), $1, $2, $3, 'like')",
                            [oid, user_id, post_id])
                          Nil
                        }
                      }
                    }
                    Error(_) -> Nil
                  }
                Error(_) -> Nil
              }
              case db_query(conn, "SELECT COUNT(*) AS cnt FROM community_likes WHERE post_id = $1", [post_id]) {
                Ok(cr) -> case list.first(cr) {
                  Ok(r) -> ok("\"toggleLike\":{\"liked\":true,\"count\":" <> int.to_string(row_int(r, "cnt")) <> "}")
                  Error(_) -> ok("\"toggleLike\":{\"liked\":true,\"count\":1}")
                }
                Error(_) -> ok("\"toggleLike\":{\"liked\":true,\"count\":1}")
              }
            }
            _ -> {
              // unlike
              let _ = db_query(conn, "DELETE FROM community_likes WHERE post_id = $1 AND user_id = $2", [post_id, user_id])
              case db_query(conn, "SELECT COUNT(*) AS cnt FROM community_likes WHERE post_id = $1", [post_id]) {
                Ok(cr) -> case list.first(cr) {
                  Ok(r) -> ok("\"toggleLike\":{\"liked\":false,\"count\":" <> int.to_string(row_int(r, "cnt")) <> "}")
                  Error(_) -> ok("\"toggleLike\":{\"liked\":false,\"count\":0}")
                }
                Error(_) -> ok("\"toggleLike\":{\"liked\":false,\"count\":0}")
              }
            }
          }
        Error(e) -> err("query_failed: " <> e)
      }
    }
  }
}

fn h_reply(vars: String, user_id: String) -> String {
  let parent_id = extract_var_string(vars, "parentId")
  let text = extract_var_string(vars, "text")
  let media = extract_var_raw(vars, "media", "[]")
  let body_json = "{\"text\":\"" <> json_esc(text) <> "\",\"media\":" <> media <> "}"
  let name = get_user_name(user_id)
  case db_connect(db_url()) {
    Error(_) -> err("database_unavailable")
    Ok(conn) -> {
      case db_query(conn,
        "INSERT INTO community_posts (id, user_id, body, parent_id) VALUES (gen_random_uuid(), $1, $2::jsonb, $3) RETURNING id, created_at",
        [user_id, body_json, parent_id],
      ) {
        Ok(rows) ->
          case list.first(rows) {
            Ok(row) -> {
              let post = Post(
                id: row_str(row, "id"), user_id: user_id, body: body_json,
                parent_id: parent_id, reshare_id: "", hidden: False,
                created_at: row_str(row, "created_at"),
                like_count: 0, liked_by_me: False, reply_count: 0, reshare_count: 0,
                author_name: name,
              )
              // notify parent owner
              case db_query(conn, "SELECT user_id FROM community_posts WHERE id = $1", [parent_id]) {
                Ok(or) -> case list.first(or) {
                  Ok(o) -> {
                    let oid = row_str(o, "user_id")
                    case oid == user_id {
                      True -> Nil
                      False -> {
                        let _ = db_query(conn,
                          "INSERT INTO community_notifications (id, user_id, actor_id, post_id, type) VALUES (gen_random_uuid(), $1, $2, $3, 'reply')",
                          [oid, user_id, parent_id])
                        Nil
                      }
                    }
                  }
                  Error(_) -> Nil
                }
                Error(_) -> Nil
              }
              ok("\"replyToPost\":" <> post_to_json(post))
            }
            Error(_) -> err("insert_failed")
          }
        Error(e) -> err("query_failed: " <> e)
      }
    }
  }
}

fn h_reshare(vars: String, user_id: String) -> String {
  let orig_id = extract_var_string(vars, "postId")
  let name = get_user_name(user_id)
  case db_connect(db_url()) {
    Error(_) -> err("database_unavailable")
    Ok(conn) -> {
      case db_query(conn, "SELECT body FROM community_posts WHERE id = $1 AND hidden = false", [orig_id]) {
        Ok(rows) ->
          case list.first(rows) {
            Ok(orig) -> {
              let body = row_str(orig, "body")
              case db_query(conn,
                "INSERT INTO community_posts (id, user_id, body, reshare_id) VALUES (gen_random_uuid(), $1, $2::jsonb, $3) RETURNING id, created_at",
                [user_id, body, orig_id],
              ) {
                Ok(ins) ->
                  case list.first(ins) {
                    Ok(row) -> {
                      let post = Post(
                        id: row_str(row, "id"), user_id: user_id, body: body,
                        parent_id: "", reshare_id: orig_id, hidden: False,
                        created_at: row_str(row, "created_at"),
                        like_count: 0, liked_by_me: False, reply_count: 0, reshare_count: 0,
                        author_name: name,
                      )
                      // notify original author
                      case db_query(conn, "SELECT user_id FROM community_posts WHERE id = $1", [orig_id]) {
                        Ok(or) -> case list.first(or) {
                          Ok(o) -> {
                            let oid = row_str(o, "user_id")
                            case oid == user_id {
                              True -> Nil
                              False -> {
                                let _ = db_query(conn,
                                  "INSERT INTO community_notifications (id, user_id, actor_id, post_id, type) VALUES (gen_random_uuid(), $1, $2, $3, 'reshare')",
                                  [oid, user_id, orig_id])
                                Nil
                              }
                            }
                          }
                          Error(_) -> Nil
                        }
                        Error(_) -> Nil
                      }
                      ok("\"resharePost\":" <> post_to_json(post))
                    }
                    Error(_) -> err("insert_failed")
                  }
                Error(e) -> err("query_failed: " <> e)
              }
            }
            Error(_) -> err("post_not_found")
          }
        Error(e) -> err("query_failed: " <> e)
      }
    }
  }
}

fn h_upload_url(vars: String) -> String {
  let filename = extract_var_string(vars, "filename")
  let _ct = extract_var_string(vars, "contentType")
  let bucket = r2_bucket()
  let ak = r2_access_key()
  let sk = r2_secret_key()
  let region = r2_region()
  let host = r2_host()
  case string.is_empty(bucket) || string.is_empty(ak) || string.is_empty(sk) {
    True -> err("r2_not_configured")
    False -> {
      // ponytail: simple microsecond timestamp for uniqueness, not a proper UUID.
      // Upgrade path: uuid:uuid_to_string(uuid:uuid4()) via FFI.
      let ts = int.to_string(erl_now_us())
      let key = "community/media/" <> ts <> "/" <> filename
      let url = r2_presign_put(bucket, key, ak, sk, region, host)
      ok("\"requestUploadUrl\":{\"uploadUrl\":\"" <> url <> "\",\"publicUrl\":\"https://" <> host <> "/" <> key <> "\"}")
    }
  }
}

@external(erlang, "erlang", "system_time")
fn erl_now_us() -> Int

fn h_mark_read(user_id: String) -> String {
  case db_connect(db_url()) {
    Error(_) -> err("database_unavailable")
    Ok(conn) ->
      case db_query(conn, "UPDATE community_notifications SET read = true WHERE user_id = $1", [user_id]) {
        Ok(_) -> ok("\"markNotificationsRead\":true")
        Error(e) -> err("query_failed: " <> e)
      }
  }
}

fn h_mark_all_read(user_id: String) -> String {
  case db_connect(db_url()) {
    Error(_) -> err("database_unavailable")
    Ok(conn) ->
      case db_query(conn, "UPDATE community_notifications SET read = true WHERE user_id = $1", [user_id]) {
        Ok(_) -> ok("\"markAllNotificationsRead\":true")
        Error(e) -> err("query_failed: " <> e)
      }
  }
}

fn h_report(vars: String, user_id: String) -> String {
  let post_id = extract_var_string(vars, "postId")
  let reason = extract_var_string(vars, "reason")
  case db_connect(db_url()) {
    Error(_) -> err("database_unavailable")
    Ok(conn) ->
      case db_query(conn,
        "INSERT INTO community_reports (id, reporter_id, post_id, reason) VALUES (gen_random_uuid(), $1, $2, $3)",
        [user_id, post_id, reason],
      ) {
        Ok(_) -> ok("\"reportPost\":true")
        Error(e) -> err("query_failed: " <> e)
      }
  }
}

fn h_block(vars: String, user_id: String) -> String {
  let blocked = extract_var_string(vars, "userId")
  case db_connect(db_url()) {
    Error(_) -> err("database_unavailable")
    Ok(conn) ->
      case db_query(conn,
        "INSERT INTO community_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [user_id, blocked],
      ) {
        Ok(_) -> ok("\"blockUser\":true")
        Error(e) -> err("query_failed: " <> e)
      }
  }
}

fn h_unblock(vars: String, user_id: String) -> String {
  let blocked = extract_var_string(vars, "userId")
  case db_connect(db_url()) {
    Error(_) -> err("database_unavailable")
    Ok(conn) ->
      case db_query(conn,
        "DELETE FROM community_blocks WHERE blocker_id = $1 AND blocked_id = $2",
        [user_id, blocked],
      ) {
        Ok(_) -> ok("\"unblockUser\":true")
        Error(e) -> err("query_failed: " <> e)
      }
  }
}

// ── JSON/query string parsing ──────────────────────────────────────
// ponytail: flat extractor for our message shapes only.

fn extract_op_name(body: String) -> String {
  case string.split(body, "\"query\":\"") {
    [_, rest, ..] -> {
      let rest2 = case string.starts_with(rest, "mutation ") {
        True -> string.drop_start(rest, 9)
        False -> case string.starts_with(rest, "query ") {
          True -> string.drop_start(rest, 6)
          False -> rest
        }
      }
      let name = string.to_graphemes(rest2)
      |> list.take_while(fn(c) { c != "(" && c != " " && c != "{" })
      |> string.concat
      case string.is_empty(name) {
        True -> {
          // Anonymous operation: find first field name after { or mutation {
          let stripped = string.replace(rest2, "\n", "") |> string.trim
          let stripped2 = case string.starts_with(stripped, "{") {
            True -> string.drop_start(stripped, 1) |> string.trim
            False -> stripped
          }
          string.to_graphemes(stripped2)
          |> list.take_while(fn(c) { c != "(" && c != " " && c != "{" && c != "\n" })
          |> string.concat
        }
        False -> name
      }
    }
    _ -> ""
  }
}

fn extract_variables(body: String) -> String {
  case string.split(body, "\"variables\":{") {
    [_, rest, ..] ->
      case string.split(rest, "}") {
        [vars, ..] -> vars
        [] -> ""
      }
    _ -> ""
  }
}

fn extract_var_string(vars: String, key: String) -> String {
  let needle = "\"" <> key <> "\":\""
  case string.split(vars, needle) {
    [_, rest, ..] ->
      string.to_graphemes(rest)
      |> list.take_while(fn(c) { c != "\"" })
      |> string.concat
    _ -> ""
  }
}

fn extract_var_int(vars: String, key: String, default: Int) -> Int {
  let needle = "\"" <> key <> "\":"
  case string.split(vars, needle) {
    [_, rest, ..] -> {
      let digits = string.to_graphemes(rest)
        |> list.take_while(fn(c) {
          c == "0" || c == "1" || c == "2" || c == "3" || c == "4"
          || c == "5" || c == "6" || c == "7" || c == "8" || c == "9"
        })
        |> string.concat
      case int.parse(digits) {
        Ok(n) -> n
        Error(_) -> default
      }
    }
    _ -> default
  }
}

fn extract_var_raw(vars: String, key: String, default: String) -> String {
  let needle = "\"" <> key <> "\":"
  case string.split(vars, needle) {
    [_, rest, ..] ->
      case string.starts_with(rest, "[") {
        True -> case string.split(rest, "]") {
          [arr, ..] -> arr <> "]"
          [] -> default
        }
        False -> case string.starts_with(rest, "{") {
          True -> case string.split(rest, "}") {
            [obj, ..] -> obj <> "}"
            [] -> default
          }
          False -> default
        }
      }
    _ -> default
  }
}
