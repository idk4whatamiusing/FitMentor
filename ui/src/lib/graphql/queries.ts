import { gql } from "graphql-request";

export const ME_QUERY = gql`query Me { me { user { id email name createdAt } profile { id name age gender heightCm weightKg goal place experience diet daysPerWeek budgetPerDay healthConditions customProteinG } } }`;

export const TODAY_AI_PLAN_QUERY = gql`query TodayAiPlan($table: String!) { todayAiPlan(table: $table) { id date plan } }`;

export const COACH_SESSIONS_QUERY = gql`query CoachSessions { coachSessions { id title messageCount } }`;

export const COACH_SESSION_QUERY = gql`query CoachSession($id: UUID!) { coachSession(id: $id) { id title messages } }`;
