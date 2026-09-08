import fitmentor_ws/jwt
import valkyrie

fn conn() -> Result(valkyrie.Connection, valkyrie.Error) {
  let url = jwt.env("REDIS_URL")
  let config = case valkyrie.url_config(url) {
    Ok(c) -> c
    Error(_) -> valkyrie.default_config()
  }
  valkyrie.create_connection(config, 2000)
}

pub fn publish(channel: String, payload: String) -> Bool {
  case conn() {
    Error(_) -> False
    Ok(c) -> {
      let _ =
        valkyrie.custom(c, ["PUBLISH", channel, payload], 2000)
      let _ = valkyrie.shutdown(c, 1000)
      True
    }
  }
}

pub fn publish_post_created(post_json: String) -> Bool {
  publish("community:feed", "{\"type\":\"post_created\",\"post\":" <> post_json <> "}")
}

pub fn publish_notification(user_id: String, notif_json: String) -> Bool {
  publish(
    "community:notifications:" <> user_id,
    "{\"type\":\"notification\",\"notification\":" <> notif_json <> "}",
  )
}
