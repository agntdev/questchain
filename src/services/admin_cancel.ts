import type { Challenge } from "../models/challenge";

export interface AdminCancelQuery {
  isAdmin(userId: number): Promise<boolean>;
  findChallengeById(id: number): Promise<Challenge | null>;
  cancelAndRefund(id: number): Promise<void>;
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
  const id = Number(args.challengeId);
  if (!Number.isInteger(id) || id < 1) {
    return {
      ok: false,
      error: "Challenge ID must be a positive whole number.",
    };
  }
  return { ok: true, challengeId: id };
}
