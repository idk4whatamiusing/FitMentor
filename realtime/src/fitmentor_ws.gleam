import fitmentor_ws/router
import gleam/erlang/process
import gleam/io
import logging

pub fn main() {
  logging.configure()
  logging.set_level(logging.Info)

  io.println("FitMentor WS starting on port 8080")

  let _ = router.start()

  process.sleep_forever()
}
