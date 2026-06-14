import type { Challenge, RewardType } from "../models/challenge";

export type CreationStep =
  | "title"
  | "description"
  | "reward_type"
  | "reward_amount"
  | "token_address"
  | "duration"
  | "verifier_count"
  | "recurrence"
  | "confirm";

export interface ChallengeCreationData {
  step: CreationStep;
  title: string;
  description: string;
  reward_type: RewardType;
  reward_amount: number;
  token_address: string | null;
  duration_days: number;
  verifier_count: number;
  recurrence: string;
}

export function emptyCreationData(): ChallengeCreationData {
  return {
    step: "title",
    title: "",
    description: "",
    reward_type: "points",
    reward_amount: 0,
    token_address: null,
    duration_days: 0,
    verifier_count: 1,
    recurrence: "none",
  };
}

export interface ChallengeCreationQuery {
  createChallenge(params: {
    creator_telegram_id: number;
    title: string;
    description: string;
    reward_type: RewardType;
    reward_amount: number;
    token_address: string | null;
    duration_days: number;
    verifier_count: number;
    recurrence: string;
  }): Promise<Challenge>;

  getBalance(
    userId: number,
    currency: string,
    tokenAddress: string | null,
  ): Promise<number>;
}

export function validateTitle(title: string): { ok: true; title: string } | { ok: false; error: string } {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Title is required." };
  }
  if (trimmed.length < 1) {
    return { ok: false, error: "Title must be at least 1 character." };
  }
  if (trimmed.length > 80) {
    return { ok: false, error: "Title must be 80 characters or fewer." };
  }
  return { ok: true, title: trimmed };
}

export function validateDescription(description: string): { ok: true; description: string } | { ok: false; error: string } {
  const trimmed = description.trim();
  if (trimmed.length > 500) {
    return { ok: false, error: "Description must be 500 characters or fewer." };
  }
  return { ok: true, description: trimmed };
}

export function validateDuration(days: number): { ok: true; days: number } | { ok: false; error: string } {
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return { ok: false, error: "Duration must be a whole number between 1 and 365 days." };
  }
  return { ok: true, days };
}

export function validateRewardAmount(amount: number): { ok: true; amount: number } | { ok: false; error: string } {
  if (!Number.isInteger(amount) || amount < 1) {
    return { ok: false, error: "Reward amount must be a positive integer." };
  }
  return { ok: true, amount };
}

export function validateTokenAddress(
  rewardType: RewardType,
  address: string | null,
): { ok: true; address: string | null } | { ok: false; error: string } {
  if (rewardType === "custom_token") {
    if (!address || address.trim().length === 0) {
      return { ok: false, error: "Token address is required for custom_token." };
    }
    return { ok: true, address: address.trim() };
  }
  return { ok: true, address: null };
}

export function formatConfirmationMessage(data: ChallengeCreationData): string {
  const currencyLabel =
    data.reward_type === "points"
      ? `${data.reward_amount} points`
      : data.reward_type === "crypto"
        ? `${data.reward_amount} crypto`
        : `${data.reward_amount} custom token (${data.token_address ?? "N/A"})`;

  const recLabel =
    data.recurrence === "weekly" ? "Weekly" : data.recurrence === "monthly" ? "Monthly" : "None";

  return [
    `⚔️ *Confirm Your Challenge*`,
    "",
    `*Title:* ${escapeMarkdown(data.title)}`,
    `*Description:* ${escapeMarkdown(data.description || "(none)")}`,
    `*Reward:* ${currencyLabel}`,
    `*Duration:* ${data.duration_days} day(s)`,
    `*Verifiers:* ${data.verifier_count}`,
    `*Recurrence:* ${recLabel}`,
    "",
    "Ready to create?",
  ].join("\n");
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}
