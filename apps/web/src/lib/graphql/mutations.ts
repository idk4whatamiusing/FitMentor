import { gql } from "graphql-request";

export const UPDATE_PROFILE_MUTATION = gql`
  mutation UpdateProfile($input: UpdateProfileInput!) {
    updateProfile(input: $input) {
      id
      name
      age
      gender
      heightCm
      weightKg
      goal
      place
      experience
      diet
      daysPerWeek
      budgetPerDay
      healthConditions
      customProteinG
    }
  }
`;

export const UPDATE_PROTEIN_TARGET_MUTATION = gql`
  mutation UpdateProteinTarget($proteinG: Int) {
    updateProteinTarget(proteinG: $proteinG) {
      id
      customProteinG
    }
  }
`;

export const UPSERT_TODAY_LOG_MUTATION = gql`
  mutation UpsertTodayLog($input: UpdateDailyLogInput!) {
    upsertTodayLog(input: $input) {
      id
      date
      water
      sleep
      steps
      proteinG
      workoutDone
      weightKg
    }
  }
`;

export const UPSERT_AI_PLAN_MUTATION = gql`
  mutation UpsertAiPlan($table: String!, $plan: JSON!) {
    upsertAiPlan(table: $table, plan: $plan) {
      id
      date
      plan
    }
  }
`;

export const CREATE_COACH_SESSION_MUTATION = gql`
  mutation CreateCoachSession($title: String) {
    createCoachSession(title: $title) {
      id
      title
      messages
    }
  }
`;

export const DELETE_COACH_SESSION_MUTATION = gql`
  mutation DeleteCoachSession($id: UUID!) {
    deleteCoachSession(id: $id)
  }
`;
