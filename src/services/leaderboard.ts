import type { LeaderboardEntry } from "../models/leaderboard";
import { LEADERBOARD_PAGE_SIZE } from "../models/leaderboard";

export interface LeaderboardQuery {
  top(limit: number): Promise<LeaderboardEntry[]>;
  entryForUser(userId: number): Promise<LeaderboardEntry | null>;
}

export interface LeaderboardView {
  leaderboard: LeaderboardEntry[];
  currentUser: LeaderboardEntry | null;
}

export async function getLeaderboardView(
  query: LeaderboardQuery,
  userId: number,
): Promise<LeaderboardView> {
  const [leaderboard, currentUser] = await Promise.all([
    query.top(LEADERBOARD_PAGE_SIZE),
    query.entryForUser(userId),
  ]);
  return { leaderboard, currentUser };
}

export function formatLeaderboardMessage(
  view: LeaderboardView,
): string {
  if (view.leaderboard.length === 0) {
    return "🏆 *Leaderboard*\n\nNo entries yet. Complete challenges to appear here!";
  }

  const lines: string[] = ["🏆 *Leaderboard*\n"];

  for (const entry of view.leaderboard) {
    const medal = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : `${entry.rank}.`;
    lines.push(
      `${medal} *${escapeMarkdown(entry.display_name)}* · ${entry.reputation_score} rep`,
    );
  }

  if (view.currentUser) {
    lines.push("");
    lines.push(
      `You: #${view.currentUser.rank} · ${view.currentUser.reputation_score} rep`,
    );
  }

  return lines.join("\n");
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}
