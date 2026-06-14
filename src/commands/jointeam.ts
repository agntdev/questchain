import { Composer, Context, InlineKeyboard } from "grammy";
import type { JoinTeamQuery } from "../services/jointeam";
import { validateJoinTeamArgs, joinTeam, formatJoinTeamMessage } from "../services/jointeam";

const VIEW_TEAM_CB = "jt:view_team";

export function createJoinTeamComposer(query: JoinTeamQuery): Composer<Context> {
  const composer = new Composer<Context>();

  composer.command("jointeam", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId == null) return;

    if (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup") {
      await ctx.reply("⚠️ /jointeam is only available in group chats.");
      return;
    }

    const fromId = ctx.from?.id;
    if (fromId == null) return;

    const text = ctx.message?.text ?? "";
    const parts = text.split(/\s+/).slice(1);

    if (parts.length < 1) {
      await ctx.reply(
        "Usage: /jointeam <team_name>\n\n" +
          "Creates a new team or joins an existing one in the active competition.\n" +
          "The first member to join a team becomes its captain."
      );
      return;
    }

    const teamName = parts.join(" ");

    const validation = validateJoinTeamArgs({ name: teamName });
    if (!validation.ok) {
      await ctx.reply(`⚠️ ${validation.error}`);
      return;
    }

    const result = await joinTeam(query, chatId, fromId, validation.name);
    const message = formatJoinTeamMessage(result);

    if (result.kind !== "no_competition" && result.kind !== "invalid_args") {
      const keyboard = new InlineKeyboard().text("👥 View Team", VIEW_TEAM_CB);
      await ctx.reply(message, {
        parse_mode: "MarkdownV2",
        reply_markup: keyboard,
      });
    } else {
      await ctx.reply(message, { parse_mode: "MarkdownV2" });
    }
  });

  composer.callbackQuery(VIEW_TEAM_CB, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      "To view your team, check the group competition standings or use /standings.",
      { parse_mode: "MarkdownV2" },
    );
  });

  return composer;
}