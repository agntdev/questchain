import type { Bot, Context } from "grammy";

export interface NearingDeadlineSession {
  session_id: number;
  user_telegram_id: number;
  challenge_title: string;
}

export interface PastDeadlineSession {
  session_id: number;
  user_telegram_id: number;
  challenge_id: number;
  challenge_title: string;
}

export interface RecurringChallenge {
  id: number;
  creator_telegram_id: number;
  title: string;
  description: string;
  reward_type: string;
  reward_amount: number;
  token_address: string | null;
  duration_days: number;
  verifier_count: number;
  recurrence: string;
  deadline: Date;
}

export interface SpawnRecurringParams {
  creator_telegram_id: number;
  title: string;
  description: string;
  reward_type: string;
  reward_amount: number;
  token_address: string | null;
  duration_days: number;
  verifier_count: number;
  recurrence: string;
  deadline: Date;
}

export interface EndedCompetition {
  id: number;
  group_chat_id: number;
  name: string;
  prize_pool_currency: string;
  prize_pool_token_address: string | null;
  prize_pool_amount: number;
}

export interface TopTeam {
  id: number;
  name: string;
  memberCount: number;
}

export interface CronQuery {
  findSessionsNearingDeadline(
    from: Date,
    to: Date,
  ): Promise<NearingDeadlineSession[]>;

  findSessionsPastDeadline(now: Date): Promise<PastDeadlineSession[]>;

  failSession(sessionId: number): Promise<void>;

  findRecurringChallengesPastDeadline(
    now: Date,
  ): Promise<RecurringChallenge[]>;

  spawnNextRecurringInstance(params: SpawnRecurringParams): Promise<void>;

  findEndedCompetitions(now: Date): Promise<EndedCompetition[]>;

  findTopTeam(competitionId: number): Promise<TopTeam | null>;

  findTeamMemberTelegramIds(teamId: number): Promise<number[]>;

  creditUserBalance(params: {
    userId: number;
    currencyType: string;
    tokenAddress: string | null;
    amount: number;
  }): Promise<void>;

  finishCompetition(competitionId: number): Promise<void>;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}

export async function processDeadlineReminders(
  query: CronQuery,
  bot: Bot<Context>,
  reminded: Set<number>,
): Promise<void> {
  const now = new Date();
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;
  const from = new Date(now.getTime() - twentyFourHoursMs - 60_000);
  const to = new Date(now.getTime() - twentyFourHoursMs + 60_000);

  const sessions = await query.findSessionsNearingDeadline(from, to);

  for (const s of sessions) {
    if (reminded.has(s.session_id)) continue;
    reminded.add(s.session_id);

    try {
      await bot.api.sendMessage(
        s.user_telegram_id,
        `⏰ Challenge *${escapeMarkdown(s.challenge_title)}* ends in ~24h — submit evidence if you haven't.`,
        { parse_mode: "MarkdownV2" },
      );
    } catch {
      // skip unreachable users
    }
  }
}

export async function processSessionFailures(
  query: CronQuery,
  bot: Bot<Context>,
): Promise<void> {
  const now = new Date();
  const sessions = await query.findSessionsPastDeadline(now);

  for (const s of sessions) {
    await query.failSession(s.session_id);

    try {
      await bot.api.sendMessage(
        s.user_telegram_id,
        `⏰ Challenge *${escapeMarkdown(s.challenge_title)}* deadline has passed. Your session has been marked as failed.`,
        { parse_mode: "MarkdownV2" },
      );
    } catch {
      // skip unreachable users
    }
  }
}

export async function processRecurringChallenges(
  query: CronQuery,
  bot: Bot<Context>,
): Promise<void> {
  const now = new Date();
  const challenges = await query.findRecurringChallengesPastDeadline(now);

  for (const ch of challenges) {
    const nextDeadline = new Date(
      ch.deadline.getTime() + ch.duration_days * 24 * 60 * 60 * 1000,
    );

    await query.spawnNextRecurringInstance({
      creator_telegram_id: ch.creator_telegram_id,
      title: ch.title,
      description: ch.description,
      reward_type: ch.reward_type,
      reward_amount: ch.reward_amount,
      token_address: ch.token_address,
      duration_days: ch.duration_days,
      verifier_count: ch.verifier_count,
      recurrence: ch.recurrence,
      deadline: nextDeadline,
    });

    try {
      await bot.api.sendMessage(
        ch.creator_telegram_id,
        `🔄 Your recurring challenge *${escapeMarkdown(ch.title)}* has rolled over to the next instance.`,
        { parse_mode: "MarkdownV2" },
      );
    } catch {
      // skip unreachable users
    }
  }
}

export async function processSeasonRollover(
  query: CronQuery,
  bot: Bot<Context>,
): Promise<void> {
  const now = new Date();
  const competitions = await query.findEndedCompetitions(now);

  for (const comp of competitions) {
    const topTeam = await query.findTopTeam(comp.id);

    if (topTeam) {
      const memberIds = await query.findTeamMemberTelegramIds(topTeam.id);
      const share =
        memberIds.length > 0
          ? comp.prize_pool_amount / memberIds.length
          : 0;

      for (const userId of memberIds) {
        await query.creditUserBalance({
          userId,
          currencyType: comp.prize_pool_currency,
          tokenAddress: comp.prize_pool_token_address,
          amount: share,
        });

        try {
          await bot.api.sendMessage(
            userId,
            `🎉 You won the *${escapeMarkdown(comp.name)}* season with team *${escapeMarkdown(topTeam.name)}*! +${share} ${comp.prize_pool_currency} credited.`,
            { parse_mode: "MarkdownV2" },
          );
        } catch {
          // skip unreachable users
        }
      }

      try {
        await bot.api.sendMessage(
          comp.group_chat_id,
          [
            `🏆 *Season Ended: ${escapeMarkdown(comp.name)}*`,
            "",
            `Winner: *${escapeMarkdown(topTeam.name)}* (${topTeam.memberCount} members)`,
            `${comp.prize_pool_amount} ${comp.prize_pool_currency} distributed among team members.`,
          ].join("\n"),
          { parse_mode: "MarkdownV2" },
        );
      } catch {
        // skip unreachable group
      }
    }

    await query.finishCompetition(comp.id);
  }
}

const remindedSessions = new Set<number>();

export function startCron(
  query: CronQuery,
  bot: Bot<Context>,
  intervalMs = 60_000,
): () => void {
  const id = setInterval(async () => {
    try {
      await Promise.all([
        processDeadlineReminders(query, bot, remindedSessions),
        processSessionFailures(query, bot),
        processRecurringChallenges(query, bot),
        processSeasonRollover(query, bot),
      ]);
    } catch {
      // log-and-continue; one failed tick must not stop the next
    }
  }, intervalMs);

  return () => clearInterval(id);
}
