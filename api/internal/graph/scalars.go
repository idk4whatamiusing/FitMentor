package graph

import (
	"encoding/json"
	"fmt"
)

// JSON mirrors async-graphql's serde_json::Value scalar.
type JSON []byte

func (JSON) ImplementsGraphQLType(name string) bool { return name == "JSON" }

func (j *JSON) UnmarshalGraphQL(input any) error {
	raw, err := json.Marshal(input)
	if err != nil {
		return err
	}
	*j = raw
	return nil
}

func (j JSON) MarshalJSON() ([]byte, error) {
	if len(j) == 0 {
		return []byte("null"), nil
	}
	return j, nil
}

func (j *JSON) UnmarshalJSON(b []byte) error {
	*j = append((*j)[:0], b...)
	return nil
}

// GQLUUID mirrors async-graphql's UUID scalar.
type GQLUUID string

func (GQLUUID) ImplementsGraphQLType(name string) bool { return name == "UUID" }

func (u *GQLUUID) UnmarshalGraphQL(input any) error {
	s, ok := input.(string)
	if !ok {
		return fmt.Errorf("UUID must be a string")
	}
	*u = GQLUUID(s)
	return nil
}

// GQLDate mirrors chrono::NaiveDate ("YYYY-MM-DD").
type GQLDate string

func (GQLDate) ImplementsGraphQLType(name string) bool { return name == "Date" }

func (d *GQLDate) UnmarshalGraphQL(input any) error {
	s, ok := input.(string)
	if !ok {
		return fmt.Errorf("Date must be a string")
	}
	*d = GQLDate(s)
	return nil
}

// GQLDateTime mirrors chrono::DateTime<Utc> (RFC 3339).
type GQLDateTime string

func (GQLDateTime) ImplementsGraphQLType(name string) bool { return name == "DateTime" }

func (d *GQLDateTime) UnmarshalGraphQL(input any) error {
	s, ok := input.(string)
	if !ok {
		return fmt.Errorf("DateTime must be a string")
	}
	*d = GQLDateTime(s)
	return nil
}
