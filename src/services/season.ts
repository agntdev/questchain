import type { GroupCompetition, PrizeCurrency } from "../models/competition";

export interface SeasonQuery {
  createCompetition(params: {
    group_chat_id: number;
    name: string;
    start_date: Date;
    end_date: Date;
    prize_pool_currency: PrizeCurrency;
    prize_pool_token_address: string | null;
    prize_pool_amount: number;
  }): Promise<GroupCompetition>;

  findActiveCompetition(groupChatId: number): Promise<GroupCompetition | null>;

  findCompetitionById(id: number): Promise<GroupCompetition | null>;
}

export function isValidPrizeCurrency(
  value: string,
): value is PrizeCurrency {
  return value === "points" || value === "crypto" || value === "custom_token";
}

export function validateNewSeasonArgs(args: {
  name: string | undefined;
  days: string | undefined;
  currencyType: string | undefined;
  tokenAddress: string | undefined;
  prizeAmount: string | undefined;
}):
  | { ok: true; name: string; days: number; currency: PrizeCurrency; tokenAddress: string | null; prizeAmount: number }
  | { ok: false; error: string }
{
  if (!args.name || args.name.trim().length === 0) {
    return { ok: false, error: "Name is required." };
  }
  if (args.name.trim().length > 80) {
    return { ok: false, error: "Name must be 80 characters or fewer." };
  }

  if (!args.days) {
    return { ok: false, error: "Duration in days is required." };
  }
  const days = Number(args.days);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return { ok: false, error: "Days must be a whole number between 1 and 365." };
  }

  if (!args.currencyType || !isValidPrizeCurrency(args.currencyType)) {
    return {
      ok: false,
      error: "Currency type must be one of: points, crypto, custom_token.",
    };
  }

  if (args.currencyType === "custom_token" && (!args.tokenAddress || args.tokenAddress.trim().length === 0)) {
    return { ok: false, error: "Token address is required for custom_token." };
  }

  if (!args.prizeAmount) {
    return { ok: false, error: "Prize amount is required." };
  }
  const prizeAmount = Number(args.prizeAmount);
  if (!Number.isFinite(prizeAmount) || prizeAmount < 0) {
    return { ok: false, error: "Prize amount must be a non-negative number." };
  }

  return {
    ok: true,
    name: args.name.trim(),
    days,
    currency: args.currencyType as PrizeCurrency,
    tokenAddress: args.tokenAddress?.trim() ?? null,
    prizeAmount,
  };
}

export function createSeasonDates(days: number): { start_date: Date; end_date: Date } {
  const start_date = new Date();
  const end_date = new Date(start_date.getTime() + days * 24 * 60 * 60 * 1000);
  return { start_date, end_date };
}