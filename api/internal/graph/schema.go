// Package graph implements the GraphQL API from api/src/graphql using
// graph-gophers/graphql-go (no codegen). Type, field, argument, and input
// names mirror async-graphql's camelCase output exactly.
package graph

const schemaSDL = `
scalar UUID
scalar JSON
scalar Date
scalar DateTime

type GqlUser {
	id: UUID!
	cfAccessSub: String!
	email: String!
	name: String
	createdAt: DateTime!
	updatedAt: DateTime!
}

type GqlProfile {
	id: UUID!
	userId: UUID!
	name: String
	age: Int
	gender: String
	heightCm: Int
	weightKg: Int
	goal: String
	place: String
	experience: String
	diet: String
	daysPerWeek: Int
	budgetPerDay: Int
	healthConditions: [String!]
	customProteinG: Int
	createdAt: DateTime
	updatedAt: DateTime
}

type GqlDailyLog {
	id: UUID!
	userId: UUID!
	date: Date!
	water: Int!
	sleep: Int!
	steps: Int!
	proteinG: Int!
	workoutDone: Boolean!
	weightKg: Float
	createdAt: DateTime
	updatedAt: DateTime
}

type GqlAiPlan {
	id: UUID!
	userId: String!
	date: Date!
	plan: JSON!
}

type GqlChatSession {
	id: UUID!
	userId: String!
	title: String!
	messages: JSON!
}

type GqlSessionListItem {
	id: UUID!
	title: String!
	messageCount: Int!
}

type GqlStreak {
	current: Int!
	longest: Int!
}

type GqlUserWithProfile {
	user: GqlUser!
	profile: GqlProfile
}

input DateRangeInput {
	from: Date!
	to: Date!
}

input UpdateProfileInput {
	name: String
	age: Int
	gender: String
	heightCm: Int
	weightKg: Int
	goal: String
	place: String
	experience: String
	diet: String
	daysPerWeek: Int
	budgetPerDay: Int
	healthConditions: [String!]
}

input UpdateDailyLogInput {
	water: Int
	sleep: Int
	steps: Int
	proteinG: Int
	workoutDone: Boolean
	weightKg: Float
}

type Query {
	me: GqlUserWithProfile!
	userExists: Boolean!
	todayLog: GqlDailyLog
	logs(input: DateRangeInput!): [GqlDailyLog!]!
	streak: GqlStreak!
	todayAiPlan(table: String!): GqlAiPlan
	coachSessions: [GqlSessionListItem!]!
	coachSession(id: UUID!): GqlChatSession
}

type Mutation {
	updateProfile(input: UpdateProfileInput!): GqlProfile!
	updateProteinTarget(proteinG: Int): GqlProfile!
	upsertTodayLog(input: UpdateDailyLogInput!): GqlDailyLog!
	upsertAiPlan(table: String!, plan: JSON!): GqlAiPlan!
	createCoachSession(title: String): GqlChatSession!
	deleteCoachSession(id: UUID!): Boolean!
	updateCoachSessionTitle(id: UUID!, title: String!): GqlChatSession!
}

type Subscription {
	logUpdated: GqlDailyLog!
	planUpdated(table: String!): GqlAiPlan!
}
`
