import { Composer, Context, InlineKeyboard } from "grammy";
import type { AdminCancelQuery } from "../services/admin";
import {
  validateAdminCancelArgs,
  cancelAdminChallenge,
  formatAdminCancelMessage,
} from "../services/admin";

const CONFIRM_CB = /^ac:confirm:(\d+)$/;
const ABORT_CB = /^ac:cancel:(\d+)$/;

export function createAdminCancelComposer(query: AdminCancelQuery): Composer<Context> {
  const composer = new Composer<Context>();

  composer.command("admin_cancel", async (ctx) => {
    const fromId = ctx.from?.id;
    if (fromId == null) return;

    const chatType = ctx.chat?.type;
    if (chatType === "group" || chatType === "supergroup") {
      try {
        const admins = await ctx.getChatAdministrators();
        const isAdmin = admins.some((admin) => admin.user.id === fromId);
        if (!isAdmin) {
          await ctx.reply("⚠️ This command is restricted to chat administrators.");
          return;
        }
      } catch {
        await ctx.reply("⚠️ Unable to verify admin status. Please try again.");
        return;
      }
    }

    const text = ctx.message?.text ?? "";
    const parts = text.split(/\s+/).slice(1);

    if (parts.length < 1) {
      await ctx.reply(
        "Usage: /admin_cancel <challenge_id>\n\n" +
          "Cancels a challenge and refunds the staked reward to the creator.",
      );
      return;
    }

    const [challengeIdStr] = parts;

    const validation = validateAdminCancelArgs({ challengeId: challengeIdStr });

    if (!validation.ok) {
      await ctx.reply(`⚠️ ${validation.error}`);
      return;
    }

    const challenge = await query.findChallenge(validation.challengeId);
    if (!challenge) {
      await ctx.reply("⚠️ Challenge not found. Make sure the challenge ID is correct.");
      return;
    }

    if (challenge.status === "cancelled") {
      await ctx.reply(`⚠️ Challenge #${challenge.id} is already cancelled.`);
      return;
    }

    const confirmMessage = [
      `⚠️ *Cancel Challenge \\#${challenge.id}?*`,
      `_Title:_ ${escapeMarkdown(challenge.title)}`,
      `_Reward:_ ${challenge.reward_amount} ${challenge.reward_type}`,
      "",
      "This will refund all staked rewards to the creator\\.",
    ].join("\n");

    const keyboard = new InlineKeyboard()
      .text("✅ Confirm Cancel", `ac:confirm:${challenge.id}`)
      .text("❌ Cancel", `ac:cancel:${challenge.id}`);

    await ctx.reply(confirmMessage, {
      parse_mode: "MarkdownV2",
      reply_markup: keyboard,
    });
  });

  composer.callbackQuery(CONFIRM_CB, async (ctx) => {
    const challengeId = parseInt(ctx.match![1], 10);

    const result = await cancelAdminChallenge(query, challengeId);
    const message = formatAdminCancelMessage(result);

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(message, { parse_mode: "MarkdownV2" });
  });

  composer.callbackQuery(ABORT_CB, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("❌ Challenge cancellation aborted.");
  });

  return composer;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}