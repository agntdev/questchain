import { Composer, Context } from "grammy";
import type { AdminCreditQuery } from "../services/admin";
import { validateAdminCreditArgs, creditAdminUser, formatAdminCreditMessage } from "../services/admin";

export function createAdminCreditComposer(query: AdminCreditQuery): Composer<Context> {
  const composer = new Composer<Context>();

  composer.command("admin_credit", async (ctx) => {
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

    if (parts.length < 4) {
      await ctx.reply(
        "Usage: /admin_credit <user_id> <currency_type> <amount> <reason>\n\n" +
          "For custom_token: /admin_credit <user_id> custom_token <token_address> <amount> <reason>\n\n" +
          "currency_type: points | crypto | custom_token",
      );
      return;
    }

    const [userStr, currencyType, ...rest] = parts;
    const isCustomToken = currencyType === "custom_token";
    let tokenAddress: string | undefined;
    let amountStr: string;
    let reasonParts: string[];

    if (isCustomToken) {
      if (rest.length < 3) {
        await ctx.reply(
          "For custom_token, provide token_address: /admin_credit <user_id> custom_token <token_address> <amount> <reason>",
        );
        return;
      }
      tokenAddress = rest[0];
      amountStr = rest[1];
      reasonParts = rest.slice(2);
    } else {
      tokenAddress = undefined;
      amountStr = rest[0];
      reasonParts = rest.slice(1);
    }

    const reason = reasonParts.join(" ");

    const validation = validateAdminCreditArgs({
      userTelegramId: userStr,
      currencyType,
      tokenAddress,
      amount: amountStr,
      reason,
    });

    if (!validation.ok) {
      await ctx.reply(`⚠️ ${validation.error}`);
      return;
    }

    const result = await creditAdminUser(
      query,
      validation.userTelegramId,
      validation.currencyType,
      validation.tokenAddress,
      validation.amount,
      validation.reason,
    );

    const message = formatAdminCreditMessage(result);
    await ctx.reply(message, { parse_mode: "MarkdownV2" });
  });

  return composer;
}