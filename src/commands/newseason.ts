import { Composer, Context, InlineKeyboard } from "grammy";
import type { SeasonQuery } from "../services/season";
import { validateNewSeasonArgs, createSeasonDates } from "../services/season";

const CREATE_TEAM_CB = "season:create_team";

export function createSeasonComposer(query: SeasonQuery): Composer<Context> {
  const composer = new Composer<Context>();

  composer.command("newseason", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId == null) return;

    if (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup") {
      await ctx.reply("⚠️ /newseason is only available in group chats.");
      return;
    }

    const fromId = ctx.from?.id;
    if (fromId == null) return;

    const text = ctx.message?.text ?? "";
    const parts = text.split(/\s+/).slice(1);

    if (parts.length < 3) {
      await ctx.reply(
        "Usage: /newseason <name> <days> <currency_type> [token_address] <prize_amount>\n\n" +
          "currency_type: points | crypto | custom_token\n" +
          "token_address is required when currency_type is custom_token.",
      );
      return;
    }

    const [name, days, currencyType, ...rest] = parts;
    const isCustomToken = currencyType === "custom_token";
    const tokenAddress = isCustomToken ? rest[0] : undefined;
    const prizeAmount = isCustomToken ? rest[1] : rest[0];

    const validation = validateNewSeasonArgs({
      name,
      days,
      currencyType,
      tokenAddress,
      prizeAmount,
    });

    if (!validation.ok) {
      await ctx.reply(`⚠️ ${validation.error}`);
      return;
    }

    const active = await query.findActiveCompetition(chatId);
    if (active) {
      await ctx.reply(
        `⚠️ There is already an active competition in this group: "${active.name}". ` +
          `It ends on ${active.end_date.toLocaleDateString()}.`,
      );
      return;
    }

    const { start_date, end_date } = createSeasonDates(validation.days);

    const competition = await query.createCompetition({
      group_chat_id: chatId,
      name: validation.name,
      start_date,
      end_date,
      prize_pool_currency: validation.currency,
      prize_pool_token_address: validation.tokenAddress,
      prize_pool_amount: validation.prizeAmount,
    });

    const currencyLabel =
      validation.currency === "points"
        ? `${validation.prizeAmount} points`
        : validation.currency === "crypto"
          ? `${validation.prizeAmount} crypto`
          : `${validation.prizeAmount} custom token`;

    const message = [
      `🏆 *New Season: ${escapeMarkdown(competition.name)}*`,
      "",
      `Prize pool: ${currencyLabel}`,
      `Duration: ${validation.days} day(s)`,
      `Starts: ${start_date.toLocaleDateString()}`,
      `Ends: ${end_date.toLocaleDateString()}`,
      "",
      "Teams can now be created with /jointeam.",
    ].join("\n");

    const keyboard = new InlineKeyboard().text("➕ Create team", CREATE_TEAM_CB);

    await ctx.reply(message, {
      parse_mode: "MarkdownV2",
      reply_markup: keyboard,
    });
  });

  composer.callbackQuery(CREATE_TEAM_CB, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      'To create a team, use: /jointeam \\<team\\_name\\>\n\n' +
        "The first member to join a team becomes its captain\\.",
      { parse_mode: "MarkdownV2" },
    );
  });

  return composer;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}