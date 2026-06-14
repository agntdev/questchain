import type { Challenge, RewardType, Recurrence } from "../models/challenge";

export type WizardStep =
  | "nc:title"
  | "nc:description"
  | "nc:reward_type"
  | "nc:reward_amount"
  | "nc:token_address"
  | "nc:duration"
  | "nc:verifier_count"
  | "nc:recurrence"
  | "nc:confirm";

export interface ChallengeDraft {
  title: string;
  description: string;
  reward_type: RewardType;
  reward_amount: number;
  token_address: string | null;
  duration_days: number;
  verifier_count: number;
  recurrence: Recurrence;
}

export interface ChallengeCreationQuery {
  createChallenge(params: {
    creator_id: number;
    title: string;
    description: string;
    reward_type: RewardType;
    reward_amount: number;
    token_address: string | null;
    duration_days: number;
    verifier_count: number;
    recurrence: Recurrence;
    deadline: Date;
  }): Promise<Challenge>;
}

export function validateTitle(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "Title cannot be empty.";
  if (trimmed.length > 80) return "Title must be 80 characters or fewer.";
  return null;
}

export function validateDescription(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "Description cannot be empty.";
  if (trimmed.length > 500) return "Description must be 500 characters or fewer.";
  return null;
}

export function validateRewardAmount(text: string): number | string {
  const num = Number(text.trim());
  if (!Number.isInteger(num) || num < 1) return "Reward amount must be a positive whole number.";
  return num;
}

export function validateTokenAddress(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "Token address cannot be empty.";
  return null;
}

export function validateCustomDuration(text: string): number | string {
  const num = Number(text.trim());
  if (!Number.isInteger(num) || num < 1 || num > 365)
    return "Duration must be a whole number between 1 and 365.";
  return num;
}

export function isDraftReady(draft: ChallengeDraft): boolean {
  return (
    draft.title.length > 0 &&
    draft.description.length > 0 &&
    draft.duration_days > 0 &&
    draft.verifier_count > 0 &&
    draft.reward_amount > 0
  );
}

export function formatConfirmation(draft: ChallengeDraft): string {
  const lines: string[] = [
    "⚔️ *Confirm Challenge*\n",
    `*Title:* ${escapeMarkdown(draft.title)}`,
    `*Description:* ${escapeMarkdown(draft.description)}`,
    `*Reward:* ${draft.reward_amount} ${draft.reward_type}`,
  ];
  if (draft.reward_type === "custom_token" && draft.token_address) {
    lines.push(`*Token:* \`${draft.token_address}\``);
  }
  lines.push(
    `*Duration:* ${draft.duration_days} day(s)`,
    `*Verifiers:* ${draft.verifier_count}`,
    `*Recurrence:* ${draft.recurrence}`,
  );
  return lines.join("\n");
}

export function createDeadline(durationDays: number): Date {
  return new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}
