import type { GroupCompetition } from "../models/competition";
import type { Team, TeamMember } from "../models/team";

export interface JoinTeamQuery {
  findActiveCompetition(groupChatId: number): Promise<GroupCompetition | null>;

  findTeamByName(
    competitionId: number,
    name: string,
  ): Promise<Team | null>;

  createTeam(params: {
    competition_id: number;
    name: string;
    captain_telegram_id: number;
  }): Promise<Team>;

  addMember(params: {
    team_id: number;
    user_telegram_id: number;
  }): Promise<TeamMember>;

  isMember(teamId: number, userTelegramId: number): Promise<boolean>;

  getTeamMembers(teamId: number): Promise<TeamMember[]>;
}

export interface JoinTeamResult {
  kind: "created" | "joined" | "already_member" | "no_competition" | "invalid_args";
  team?: Team;
  memberCount?: number;
}

export function validateJoinTeamArgs(args: {
  name: string | undefined;
}):
  | { ok: true; name: string }
  | { ok: false; error: string }
{
  if (!args.name || args.name.trim().length === 0) {
    return { ok: false, error: "Team name is required." };
  }
  if (args.name.trim().length > 40) {
    return { ok: false, error: "Team name must be 40 characters or fewer." };
  }
  return { ok: true, name: args.name.trim() };
}

export async function joinTeam(
  query: JoinTeamQuery,
  groupChatId: number,
  userTelegramId: number,
  teamName: string,
): Promise<JoinTeamResult> {
  const competition = await query.findActiveCompetition(groupChatId);
  if (!competition) {
    return { kind: "no_competition" };
  }

  let team = await query.findTeamByName(competition.id, teamName);

  if (team) {
    const alreadyMember = await query.isMember(team.id, userTelegramId);
    if (alreadyMember) {
      const members = await query.getTeamMembers(team.id);
      return { kind: "already_member", team, memberCount: members.length };
    }

    await query.addMember({
      team_id: team.id,
      user_telegram_id: userTelegramId,
    });

    const members = await query.getTeamMembers(team.id);
    return { kind: "joined", team, memberCount: members.length };
  }

  team = await query.createTeam({
    competition_id: competition.id,
    name: teamName,
    captain_telegram_id: userTelegramId,
  });

  const members = await query.getTeamMembers(team.id);
  return { kind: "created", team, memberCount: members.length };
}

export function formatJoinTeamMessage(result: JoinTeamResult): string {
  switch (result.kind) {
    case "no_competition":
      return "⚠️ There is no active competition in this group. Use /newseason to start one!";

    case "already_member":
      return [
        `ℹ️ You are already a member of team *${escapeMarkdown(result.team!.name)}*`,
        `Members: ${result.memberCount}`,
      ].join("\n");

    case "created":
      return [
        `🏆 *Team "${escapeMarkdown(result.team!.name)}" created!*`,
        "",
        "You are the team captain.",
        `Members: ${result.memberCount}`,
        "",
        "Other players can join with: /jointeam " + result.team!.name,
      ].join("\n");

    case "joined":
      return [
        `✅ You joined team *${escapeMarkdown(result.team!.name)}*!`,
        `Members: ${result.memberCount}`,
      ].join("\n");

    default:
      return "⚠️ Something went wrong.";
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}