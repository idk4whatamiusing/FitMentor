package handlers

import (
	"net/http"
)

func Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]any{"status": "ok", "version": "1.0.0"})
}
