export type RsvpStatus = "pending" | "going" | "maybe" | "declined";
export type BlastChannel = "sms" | "email" | "both";
export type RecipientFilter = "all" | "going_only" | "unclaimed_only";

export interface RecipeSuggestion {
  id: number;
  title: string;
  prepTime: number;
  servings: number;
  difficulty: "easy" | "medium" | "hard";
  url: string;
}
