import { Composer, Context, InlineKeyboard } from "grammy";
import type { LeaderboardQuery } from "../services/leaderboard";
import { getLeaderboardView, formatLeaderboardMessage } from "../services/leaderboard";

const REFRESH_LEADERBOARD = "lb:refresh";

export function createLeaderboardComposer(query: LeaderboardQuery): Composer<Context> {
  const composer = new Composer<Context>();

  composer.command("leaderboard", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId == null) return;

    const view = await getLeaderboardView(query, userId);
    const message = formatLeaderboardMessage(view);
    const keyboard = new InlineKeyboard().text("🔄 Refresh", REFRESH_LEADERBOARD);

    await ctx.reply(message, {
      parse_mode: "MarkdownV2",
      reply_markup: keyboard,
    });
  });

  composer.callbackQuery(REFRESH_LEADERBOARD, async (ctx) => {
    const userId = ctx.from.id;
    const view = await getLeaderboardView(query, userId);
    const message = formatLeaderboardMessage(view);
    const keyboard = new InlineKeyboard().text("🔄 Refresh", REFRESH_LEADERBOARD);

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(message, {
      parse_mode: "MarkdownV2",
      reply_markup: keyboard,
    });
  });

  return composer;
}
