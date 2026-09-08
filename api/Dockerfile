FROM golang:1.23-alpine AS builder

WORKDIR /app
COPY api/go.mod api/go.sum ./
RUN go mod download

COPY api/ ./
RUN CGO_ENABLED=0 go build -o /fitmentor-api ./cmd/server

FROM alpine:3.20

RUN apk add --no-cache ca-certificates
COPY --from=builder /fitmentor-api /usr/local/bin/

EXPOSE 3000
CMD ["fitmentor-api"]
