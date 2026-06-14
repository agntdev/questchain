import { Composer, Context, InlineKeyboard } from "grammy";
import type { StandingsQuery } from "../services/standings";
import { getStandingsView, formatStandingsMessage } from "../services/standings";

const REFRESH_STANDINGS = "st:refresh";

export function createStandingsComposer(query: StandingsQuery): Composer<Context> {
  const composer = new Composer<Context>();

  composer.command("standings", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId == null) return;

    if (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup") {
      await ctx.reply("⚠️ /standings is only available in group chats.");
      return;
    }

    const view = await getStandingsView(query, chatId);
    if (!view) {
      await ctx.reply(
        "⚠️ There is no active competition in this group. Use /newseason to start one!",
      );
      return;
    }

    const message = formatStandingsMessage(view);
    const keyboard = new InlineKeyboard().text("🔄 Refresh", REFRESH_STANDINGS);

    await ctx.reply(message, {
      parse_mode: "MarkdownV2",
      reply_markup: keyboard,
    });
  });

  composer.callbackQuery(REFRESH_STANDINGS, async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId == null) return;

    const view = await getStandingsView(query, chatId);
    if (!view) {
      await ctx.answerCallbackQuery({ text: "No active competition.", show_alert: true });
      return;
    }

    const message = formatStandingsMessage(view);
    const keyboard = new InlineKeyboard().text("🔄 Refresh", REFRESH_STANDINGS);

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(message, {
      parse_mode: "MarkdownV2",
      reply_markup: keyboard,
    });
  });

  return composer;
}