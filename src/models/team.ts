export interface Team {
  id: number;
  competition_id: number;
  name: string;
  captain_telegram_id: number;
}

export interface TeamMember {
  team_id: number;
  user_telegram_id: number;
  joined_at: Date;
}

export function createTeam(params: {
  id: number;
  competition_id: number;
  name: string;
  captain_telegram_id: number;
}): Team {
  return {
    id: params.id,
    competition_id: params.competition_id,
    name: params.name,
    captain_telegram_id: params.captain_telegram_id,
  };
}

export function createTeamMember(params: {
  team_id: number;
  user_telegram_id: number;
}): TeamMember {
  return {
    team_id: params.team_id,
    user_telegram_id: params.user_telegram_id,
    joined_at: new Date(),
  };
}

export interface TeamStanding {
  team_id: number;
  team_name: string;
  member_count: number;
  score: number;
  rank: number;
}

export const STANDINGS_PAGE_SIZE = 20;

export function createTeamStanding(params: {
  team_id: number;
  team_name: string;
  member_count: number;
  score: number;
  rank: number;
}): TeamStanding {
  return {
    team_id: params.team_id,
    team_name: params.team_name,
    member_count: params.member_count,
    score: params.score,
    rank: params.rank,
  };
}