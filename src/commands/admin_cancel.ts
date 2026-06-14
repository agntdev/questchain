import { Composer, Context } from "grammy";
import type { AdminCancelQuery } from "../services/admin";
import { validateAdminCancelArgs, cancelAdminChallenge, formatAdminCancelMessage } from "../services/admin";

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

    const result = await cancelAdminChallenge(query, validation.challengeId);

    const message = formatAdminCancelMessage(result);
    await ctx.reply(message, { parse_mode: "MarkdownV2" });
  });

  return composer;
}