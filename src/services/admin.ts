import type { User } from "../models/user";

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
