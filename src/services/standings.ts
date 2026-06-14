import type { GroupCompetition } from "../models/competition";
import type { TeamStanding } from "../models/team";
import { STANDINGS_PAGE_SIZE } from "../models/team";

export interface StandingsQuery {
  findActiveCompetition(groupChatId: number): Promise<GroupCompetition | null>;
  getTeamStandings(competitionId: number, limit: number): Promise<TeamStanding[]>;
}

export interface StandingsView {
  competition: GroupCompetition;
  standings: TeamStanding[];
}

export async function getStandingsView(
  query: StandingsQuery,
  groupChatId: number,
): Promise<StandingsView | null> {
  const competition = await query.findActiveCompetition(groupChatId);
  if (!competition) return null;

  const standings = await query.getTeamStandings(competition.id, STANDINGS_PAGE_SIZE);
  return { competition, standings };
}

export function formatStandingsMessage(
  view: StandingsView,
): string {
  const { competition, standings } = view;

  if (standings.length === 0) {
    const header = [
      `🏆 *${escapeMarkdown(competition.name)} Standings*`,
      "",
      `Ends: ${competition.end_date.toLocaleDateString()}`,
      "",
      "No teams have joined yet. Create a team with /jointeam!",
    ].join("\n");
    return header;
  }

  const lines: string[] = [
    `🏆 *${escapeMarkdown(competition.name)} Standings*`,
    "",
    `Prize pool: ${competition.prize_pool_amount} ${competition.prize_pool_currency}`,
    `Ends: ${competition.end_date.toLocaleDateString()}`,
    "",
  ];

  for (const entry of standings) {
    const medal =
      entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : `${entry.rank}.`;
    const memberLabel = entry.member_count === 1 ? "member" : "members";
    lines.push(
      `${medal} *${escapeMarkdown(entry.team_name)}* · ${entry.member_count} ${memberLabel} · ${entry.score} pts`,
    );
  }

  return lines.join("\n");
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}