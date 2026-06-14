import type { Challenge } from "../models/challenge";

export interface MyChallengesQuery {
  findByCreator(userId: number): Promise<Challenge[]>;
}

export interface MyChallengesView {
  active: Challenge[];
  past: Challenge[];
}

export async function getMyChallengesView(
  query: MyChallengesQuery,
  userId: number,
): Promise<MyChallengesView> {
  const challenges = await query.findByCreator(userId);
  const active: Challenge[] = [];
  const past: Challenge[] = [];

  for (const ch of challenges) {
    if (ch.status === "active" || ch.status === "draft") {
      active.push(ch);
    } else {
      past.push(ch);
    }
  }

  return { active, past };
}

export function formatMyChallengesMessage(
  view: MyChallengesView,
): string {
  const total = view.active.length + view.past.length;

  if (total === 0) {
    return "📋 *My Challenges*\n\nYou haven't created any challenges yet. Use /create to start one!";
  }

  const lines: string[] = ["📋 *My Challenges*\n"];

  if (view.active.length > 0) {
    lines.push(`🟢 *Active* (${view.active.length})`);
    for (const ch of view.active) {
      lines.push(
        `  · *${escapeMarkdown(ch.title)}* — ${ch.duration_days}d · ${ch.reward_type} · ${ch.verifier_count} verifier(s)`,
      );
    }
    lines.push("");
  }

  if (view.past.length > 0) {
    lines.push(`⚫ *Past* (${view.past.length})`);
    for (const ch of view.past) {
      lines.push(
        `  · *${escapeMarkdown(ch.title)}* — ${ch.status} · ${ch.duration_days}d`,
      );
    }
  }

  return lines.join("\n");
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}
