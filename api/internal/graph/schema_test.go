package graph

import (
	"testing"

	"fitmentor/api/internal/app"
)

// Parsing validates the SDL and that every field has a matching resolver
// method with a compatible signature.
func TestSchemaParses(t *testing.T) {
	if _, err := NewSchema(&app.State{}); err != nil {
		t.Fatalf("schema parse failed: %v", err)
	}
}
