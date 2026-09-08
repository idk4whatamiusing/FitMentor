FROM ghcr.io/gleam-lang/gleam:v1.17.0-erlang-alpine

RUN apk add --no-cache ca-certificates

WORKDIR /app
COPY gleam.toml ./
COPY src ./src
RUN gleam build

EXPOSE 8080
CMD ["gleam", "run"]
