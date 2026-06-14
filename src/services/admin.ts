import type { User } from "../models/user";
import type { Challenge } from "../models/challenge";

export interface AdminCreditQuery {
  findUser(telegramId: number): Promise<User | null>;

  creditBalance(params: {
    userId: number;
    currencyType: string;
    tokenAddress: string | null;
    amount: number;
  }): Promise<void>;

  logAdminAction(params: {
    userTelegramId: number;
    delta: number;
    reason: string;
  }): Promise<void>;
}

export interface AdminCreditResult {
  kind: "credited" | "user_not_found" | "invalid_args";
  user?: User;
  currencyType?: string;
  tokenAddress?: string | null;
  amount?: number;
  reason?: string;
}

export function validateAdminCreditArgs(args: {
  userTelegramId: string | undefined;
  currencyType: string | undefined;
  tokenAddress: string | undefined;
  amount: string | undefined;
  reason: string | undefined;
}):
  | { ok: true; userTelegramId: number; currencyType: string; tokenAddress: string | null; amount: number; reason: string }
  | { ok: false; error: string }
{
  if (!args.userTelegramId) {
    return { ok: false, error: "User ID is required." };
  }
  const userTelegramId = Number(args.userTelegramId);
  if (!Number.isInteger(userTelegramId) || userTelegramId <= 0) {
    return { ok: false, error: "User ID must be a positive integer." };
  }

  if (!args.currencyType) {
    return { ok: false, error: "Currency type is required." };
  }
  const currencyType = args.currencyType;
  if (currencyType !== "points" && currencyType !== "crypto" && currencyType !== "custom_token") {
    return { ok: false, error: "Currency type must be one of: points, crypto, custom_token." };
  }

  let tokenAddress: string | null = null;
  if (currencyType === "custom_token") {
    if (!args.tokenAddress || args.tokenAddress.trim().length === 0) {
      return { ok: false, error: "Token address is required for custom_token." };
    }
    tokenAddress = args.tokenAddress.trim();
  }

  if (!args.amount) {
    return { ok: false, error: "Amount is required." };
  }
  const amount = Number(args.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Amount must be a positive number." };
  }

  if (!args.reason || args.reason.trim().length === 0) {
    return { ok: false, error: "Reason is required." };
  }
  const reason = args.reason.trim();
  if (reason.length > 200) {
    return { ok: false, error: "Reason must be 200 characters or fewer." };
  }

  return { ok: true, userTelegramId, currencyType, tokenAddress, amount, reason };
}

export async function creditAdminUser(
  query: AdminCreditQuery,
  userTelegramId: number,
  currencyType: string,
  tokenAddress: string | null,
  amount: number,
  reason: string,
): Promise<AdminCreditResult> {
  const user = await query.findUser(userTelegramId);
  if (!user) {
    return { kind: "user_not_found" };
  }

  await query.creditBalance({
    userId: userTelegramId,
    currencyType,
    tokenAddress,
    amount,
  });

  await query.logAdminAction({
    userTelegramId,
    delta: 0,
    reason: `admin_credit: ${reason}`,
  });

  return {
    kind: "credited",
    user,
    currencyType,
    tokenAddress,
    amount,
    reason,
  };
}

export function formatAdminCreditMessage(result: AdminCreditResult): string {
  switch (result.kind) {
    case "user_not_found":
      return "⚠️ User not found. Make sure the Telegram user ID is correct.";

    case "credited":
      return [
        `💰 *Balance Credited*`,
        "",
        `User: *${escapeMarkdown(result.user!.name)}* \\(ID: \`${result.user!.telegram_id}\`\\)`,
        `Amount: ${result.amount} ${result.currencyType}`,
        `Reason: ${result.reason}`,
      ].join("\n");

    case "invalid_args":
    default:
      return "⚠️ Something went wrong.";
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}

export interface AdminCancelQuery {
  findChallenge(id: number): Promise<Challenge | null>;
  cancelChallenge(id: number): Promise<void>;
  refundBalance(params: {
    userId: number;
    currencyType: string;
    tokenAddress: string | null;
    amount: number;
  }): Promise<void>;
  logAdminAction(params: {
    userTelegramId: number;
    delta: number;
    reason: string;
  }): Promise<void>;
}

export interface AdminCancelResult {
  kind: "cancelled" | "challenge_not_found" | "invalid_args" | "already_cancelled";
  challenge?: Challenge;
}

export function validateAdminCancelArgs(args: {
  challengeId: string | undefined;
}):
  | { ok: true; challengeId: number }
  | { ok: false; error: string }
{
  if (!args.challengeId) {
    return { ok: false, error: "Challenge ID is required." };
  }
  const challengeId = Number(args.challengeId);
  if (!Number.isInteger(challengeId) || challengeId <= 0) {
    return { ok: false, error: "Challenge ID must be a positive integer." };
  }
  return { ok: true, challengeId };
}

export async function cancelAdminChallenge(
  query: AdminCancelQuery,
  challengeId: number,
): Promise<AdminCancelResult> {
  const challenge = await query.findChallenge(challengeId);
  if (!challenge) {
    return { kind: "challenge_not_found" };
  }

  if (challenge.status === "cancelled") {
    return { kind: "already_cancelled", challenge };
  }

  await query.cancelChallenge(challengeId);

  await query.refundBalance({
    userId: challenge.creator_id,
    currencyType: challenge.reward_type,
    tokenAddress: challenge.token_address,
    amount: challenge.reward_amount,
  });

  await query.logAdminAction({
    userTelegramId: challenge.creator_id,
    delta: 0,
    reason: `admin_cancel: challenge #${challengeId}`,
  });

  return {
    kind: "cancelled",
    challenge: { ...challenge, status: "cancelled" },
  };
}

export function formatAdminCancelMessage(result: AdminCancelResult): string {
  switch (result.kind) {
    case "challenge_not_found":
      return "⚠️ Challenge not found. Make sure the challenge ID is correct.";

    case "already_cancelled":
      return `⚠️ Challenge #${result.challenge!.id} is already cancelled.`;

    case "cancelled":
      return [
        `🚫 *Challenge Cancelled*`,
        "",
        `Challenge \\#${result.challenge!.id} \\(${escapeMarkdown(result.challenge!.title)}\\) has been cancelled\\.`,
        `Refunded ${result.challenge!.reward_amount} ${result.challenge!.reward_type} to creator\\.`,
      ].join("\n");

    case "invalid_args":
    default:
      return "⚠️ Something went wrong.";
  }
}
