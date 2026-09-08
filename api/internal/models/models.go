// Package models mirrors api/src/models (user.rs, profile.rs, daily_log.rs).
package models

import "time"

// UUID is stored as text; Postgres casts parameter strings to uuid implicitly.
type UUID = string

type User struct {
	ID        UUID
	CFSub     string
	Email     string
	Name      *string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Subscription struct {
	ID                 UUID
	UserID             UUID
	PolarSubID         *string
	Tier               string
	Status             string
	CurrentPeriodStart *time.Time
	CurrentPeriodEnd   *time.Time
	CancelAtPeriodEnd  *bool
}

type Profile struct {
	ID               UUID
	UserID           UUID
	Name             *string
	Age              *int16
	Gender           *string
	HeightCm         *int16
	WeightKg         *int16
	Goal             *string
	Place            *string
	Experience       *string
	Diet             *string
	DaysPerWeek      *int16
	BudgetPerDay     *int16
	HealthConditions []string
	CustomProteinG   *int16
	CreatedAt        *time.Time
	UpdatedAt        *time.Time
}

type UpdateProfile struct {
	Name             *string   `json:"name"`
	Age              *int16    `json:"age"`
	Gender           *string   `json:"gender"`
	HeightCm         *int16    `json:"heightCm"`
	WeightKg         *int16    `json:"weightKg"`
	Goal             *string   `json:"goal"`
	Place            *string   `json:"place"`
	Experience       *string   `json:"experience"`
	Diet             *string   `json:"diet"`
	DaysPerWeek      *int16    `json:"daysPerWeek"`
	BudgetPerDay     *int16    `json:"budgetPerDay"`
	HealthConditions *[]string `json:"healthConditions"`
}

type ProteinTarget struct {
	ProteinG *int16 `json:"proteinG"`
}

type DailyLog struct {
	ID          UUID
	UserID      UUID
	Date        time.Time
	Water       int32
	Sleep       int32
	Steps       int32
	ProteinG    int32
	WorkoutDone bool
	WeightKg    *float32
	CreatedAt   *time.Time
	UpdatedAt   *time.Time
}

type UpdateDailyLog struct {
	Water       *int32   `json:"water"`
	Sleep       *float32 `json:"sleep"`
	Steps       *int32   `json:"steps"`
	ProteinG    *float32 `json:"proteinG"`
	WorkoutDone *bool    `json:"workoutDone"`
	WeightKg    *float32 `json:"weightKg"`
}
