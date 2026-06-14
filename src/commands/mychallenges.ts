import { Composer, Context, InlineKeyboard } from "grammy";
import type { MyChallengesQuery } from "../services/mychallenges";
import { getMyChallengesView, formatMyChallengesMessage } from "../services/mychallenges";

const REFRESH_MYCHALLENGES = "mc:refresh";

export function createMyChallengesComposer(query: MyChallengesQuery): Composer<Context> {
  const composer = new Composer<Context>();

  composer.command("mychallenges", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId == null) return;

    const view = await getMyChallengesView(query, userId);
    const message = formatMyChallengesMessage(view);
    const keyboard = new InlineKeyboard().text("🔄 Refresh", REFRESH_MYCHALLENGES);

    await ctx.reply(message, {
      parse_mode: "MarkdownV2",
      reply_markup: keyboard,
    });
  });

  composer.callbackQuery(REFRESH_MYCHALLENGES, async (ctx) => {
    const userId = ctx.from.id;
    const view = await getMyChallengesView(query, userId);
    const message = formatMyChallengesMessage(view);
    const keyboard = new InlineKeyboard().text("🔄 Refresh", REFRESH_MYCHALLENGES);

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(message, {
      parse_mode: "MarkdownV2",
      reply_markup: keyboard,
    });
  });

  return composer;
}
