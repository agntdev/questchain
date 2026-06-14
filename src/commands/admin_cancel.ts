import { Composer, Context, InlineKeyboard } from "grammy";
import type { AdminCancelQuery } from "../services/admin_cancel";
import { validateAdminCancelArgs } from "../services/admin_cancel";

const CONFIRM_CANCEL_PREFIX = "ac:confirm:";
const CANCEL_ACTION = "ac:cancel";

export function createAdminCancelComposer(
  query: AdminCancelQuery,
): Composer<Context> {
  const composer = new Composer<Context>();

  composer.command("admin_cancel", async (ctx) => {
    const fromId = ctx.from?.id;
    if (fromId == null) return;

    const isAdmin = await query.isAdmin(fromId);
    if (!isAdmin) {
      await ctx.reply("⚠️ You do not have permission to use this command.");
      return;
    }

    const text = ctx.message?.text ?? "";
    const parts = text.split(/\s+/).slice(1);

    const validation = validateAdminCancelArgs({
      challengeId: parts[0],
    });

    if (!validation.ok) {
      await ctx.reply(`⚠️ ${validation.error}\n\nUsage: /admin_cancel <challenge_id>`);
      return;
    }

    const challenge = await query.findChallengeById(validation.challengeId);
    if (!challenge) {
      await ctx.reply(
        `⚠️ Challenge #${validation.challengeId} not found.`,
      );
      return;
    }

    if (challenge.status === "cancelled") {
      await ctx.reply(
        `⚠️ Challenge #${challenge.id} is already cancelled.`,
      );
      return;
    }

    const message = [
      `⚠️ *Cancel Challenge #${challenge.id}?*`,
      "",
      `*${escapeMarkdown(challenge.title)}*`,
      `Status: ${challenge.status}`,
      `Creator ID: \`${challenge.creator_id}\``,
      "",
      "This will refund all staked rewards to the creator.",
    ].join("\n");

    const keyboard = new InlineKeyboard()
      .text("✅ Confirm Cancel", `${CONFIRM_CANCEL_PREFIX}${challenge.id}`)
      .text("❌ Cancel", CANCEL_ACTION);

    await ctx.reply(message, {
      parse_mode: "MarkdownV2",
      reply_markup: keyboard,
    });
  });

  composer.callbackQuery(new RegExp(`^${CONFIRM_CANCEL_PREFIX}(\\d+)$`), async (ctx) => {
    const fromId = ctx.from.id;

    const isAdmin = await query.isAdmin(fromId);
    if (!isAdmin) {
      await ctx.answerCallbackQuery({
        text: "You do not have permission for this action.",
        show_alert: true,
      });
      return;
    }

    const challengeId = Number(ctx.match![1]);

    const challenge = await query.findChallengeById(challengeId);
    if (!challenge || challenge.status === "cancelled") {
      await ctx.answerCallbackQuery({
        text: "This challenge is no longer active.",
        show_alert: true,
      });
      return;
    }

    await query.cancelAndRefund(challengeId);

    await ctx.answerCallbackQuery({ text: "Challenge cancelled and stakes refunded." });

    const message = [
      `✅ *Challenge #${challengeId} Cancelled*`,
      "",
      `*${escapeMarkdown(challenge.title)}*`,
      "All staked rewards have been refunded to the creator.",
    ].join("\n");

    await ctx.editMessageText(message, { parse_mode: "MarkdownV2" });
  });

  composer.callbackQuery(CANCEL_ACTION, async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Cancellation aborted." });

    if (ctx.callbackQuery.message?.text) {
      const originalText = ctx.callbackQuery.message.text;
      const lines = originalText.split("\n");
      lines[0] = `❌ ${lines[0]}`;
      lines.push("");
      lines.push("_Cancellation was aborted._");

      await ctx.editMessageText(lines.join("\n"), { parse_mode: "MarkdownV2" });
    }
  });

  return composer;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}
