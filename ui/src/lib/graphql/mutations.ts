import { gql } from "graphql-request";

export const UPDATE_PROFILE_MUTATION = gql`mutation UpdateProfile($input: UpdateProfileInput!) { updateProfile(input: $input) { id name age gender heightCm weightKg goal place experience diet daysPerWeek budgetPerDay healthConditions customProteinG } }`;

export const CREATE_COACH_SESSION_MUTATION = gql`mutation CreateCoachSession($title: String) { createCoachSession(title: $title) { id title messages } }`;

export const DELETE_COACH_SESSION_MUTATION = gql`mutation DeleteCoachSession($id: UUID!) { deleteCoachSession(id: $id) }`;

export const UPDATE_COACH_SESSION_TITLE_MUTATION = gql`mutation UpdateCoachSessionTitle($id: UUID!, $title: String!) { updateCoachSessionTitle(id: $id, title: $title) { id title messages } }`;
