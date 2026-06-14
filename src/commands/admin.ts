import { Composer, Context, InlineKeyboard } from "grammy";

const VALID_CURRENCIES = ["points", "crypto", "custom_token"] as const;

const ADMIN_CREDIT_CONFIRM = /^admin:credit:confirm:(\d+):(\w+):(\d+(?:\.\d+)?):(.+)$/;
const ADMIN_CREDIT_CANCEL = "admin:credit:cancel";
const ADMIN_CANCEL_CONFIRM = /^admin:cancel:confirm:(\d+)$/;
const ADMIN_CANCEL_CANCEL = "admin:cancel:cancel";

export interface AdminQuery {
  isAdmin(userId: number): Promise<boolean>;
  getUser(userId: number): Promise<{ telegram_id: number; name: string } | null>;
  creditBalance(params: {
    userId: number;
    currencyType: string;
    amount: number;
    reason: string;
  }): Promise<void>;
  cancelChallenge(params: {
    challengeId: number;
    adminId: number;
    reason?: string;
  }): Promise<{ creatorId: number; title: string } | null>;
  logAdminAction(params: {
    adminId: number;
    targetUserId: number;
    action: string;
    details: string;
  }): Promise<void>;
}

export function createAdminComposer(query: AdminQuery): Composer<Context> {
  const composer = new Composer<Context>();

  composer.command("admin_credit", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId == null) return;
    if (!(await requireAdmin(ctx, query, userId))) return;

    const args = ctx.match?.toString().trim();
    if (!args) {
      await ctx.reply(formatCreditUsage(), { parse_mode: "MarkdownV2" });
      return;
    }

    const parts = args.split(/\s+/);
    if (parts.length < 4) {
      await ctx.reply(formatCreditUsage(), { parse_mode: "MarkdownV2" });
      return;
    }

    const targetId = parseInt(parts[0], 10);
    const currency = parts[1].toLowerCase();
    const amount = parseFloat(parts[2]);
    const reason = parts.slice(3).join(" ");

    if (isNaN(targetId) || isNaN(amount) || amount <= 0) {
      await ctx.reply("Invalid user ID or amount. Use positive numbers.", { parse_mode: "MarkdownV2" });
      return;
    }

    if (!VALID_CURRENCIES.includes(currency as typeof VALID_CURRENCIES[number])) {
      await ctx.reply(
        `Invalid currency. Must be one of: ${VALID_CURRENCIES.join(", ")}`,
        { parse_mode: "MarkdownV2" },
      );
      return;
    }

    const targetUser = await query.getUser(targetId);
    if (!targetUser) {
      await ctx.reply(`User with ID \`${targetId}\` not found.`, { parse_mode: "MarkdownV2" });
      return;
    }

    const confirmData = `admin:credit:confirm:${targetId}:${currency}:${amount}:${encodeURIComponent(reason)}`;
    const keyboard = new InlineKeyboard()
      .text("✅ Confirm", confirmData)
      .text("❌ Cancel", ADMIN_CREDIT_CANCEL);

    await ctx.reply(
      `💰 *Crediting User*\n\n` +
        `User: ${escapeMarkdown(targetUser.name)} \\(` + "`" + `${targetId}` + "`" + `\\)\n` +
        `Currency: \`${escapeMarkdown(currency)}\`\n` +
        `Amount: \`${amount}\`\n` +
        `Reason: ${escapeMarkdown(reason)}\n\n` +
        `_Confirm this transaction?_`,
      { parse_mode: "MarkdownV2", reply_markup: keyboard },
    );
  });

  composer.callbackQuery(ADMIN_CREDIT_CONFIRM, async (ctx) => {
    const userId = ctx.from.id;
    if (!(await requireAdmin(ctx, query, userId))) return;

    const match = ctx.match as RegExpMatchArray;
    const targetId = parseInt(match[1], 10);
    const currency = match[2];
    const amount = parseFloat(match[3]);
    const reason = decodeURIComponent(match[4]);

    await query.creditBalance({ userId: targetId, currencyType: currency, amount, reason });
    await query.logAdminAction({ adminId: userId, targetUserId: targetId, action: "credit", details: `${amount} ${currency} — ${reason}` });

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `✅ *Credited* ${amount} ${escapeMarkdown(currency)} to user \`${targetId}\`\nReason: ${escapeMarkdown(reason)}`,
      { parse_mode: "MarkdownV2" },
    );
  });

  composer.callbackQuery(ADMIN_CREDIT_CANCEL, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("❌ Credit cancelled.", { parse_mode: "MarkdownV2" });
  });

  composer.command("admin_cancel", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId == null) return;
    if (!(await requireAdmin(ctx, query, userId))) return;

    const args = ctx.match?.toString().trim();
    if (!args) {
      await ctx.reply(formatCancelUsage(), { parse_mode: "MarkdownV2" });
      return;
    }

    const challengeId = parseInt(args.split(/\s+/)[0], 10);
    if (isNaN(challengeId)) {
      await ctx.reply("Invalid challenge ID.", { parse_mode: "MarkdownV2" });
      return;
    }

    const confirmData = `admin:cancel:confirm:${challengeId}`;
    const keyboard = new InlineKeyboard()
      .text("⚠️ Confirm Cancel", confirmData)
      .text("❌ Cancel", ADMIN_CANCEL_CANCEL);

    await ctx.reply(
      `⚠️ *Cancel Challenge \\#${challengeId}?*\n\n` +
        `This will refund all staked balances to the creator\\.\n\n` +
        `_This action cannot be undone\\._`,
      { parse_mode: "MarkdownV2", reply_markup: keyboard },
    );
  });

  composer.callbackQuery(ADMIN_CANCEL_CONFIRM, async (ctx) => {
    const userId = ctx.from.id;
    if (!(await requireAdmin(ctx, query, userId))) return;

    const match = ctx.match as RegExpMatchArray;
    const challengeId = parseInt(match[1], 10);

    const result = await query.cancelChallenge({ challengeId, adminId: userId });
    if (!result) {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        `❌ Challenge \\#${challengeId} not found or already not active\\.`,
        { parse_mode: "MarkdownV2" },
      );
      return;
    }

    await query.logAdminAction({
      adminId: userId,
      targetUserId: result.creatorId,
      action: "cancel_challenge",
      details: `Challenge #${challengeId} — "${result.title}"`,
    });

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `✅ *Challenge \\#${challengeId} cancelled*\n\n` +
        `Title: ${escapeMarkdown(result.title)}\n` +
        `Creator: \`${result.creatorId}\`\n` +
        `Staked balances have been refunded\\.`,
      { parse_mode: "MarkdownV2" },
    );
  });

  composer.callbackQuery(ADMIN_CANCEL_CANCEL, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("❌ Cancellation aborted.", { parse_mode: "MarkdownV2" });
  });

  return composer;
}

async function requireAdmin(
  ctx: Context,
  query: AdminQuery,
  userId: number,
): Promise<boolean> {
  const isAdmin = await query.isAdmin(userId);
  if (!isAdmin) {
    await ctx.reply("⛔ *Access denied*\\. Admin only\\.", { parse_mode: "MarkdownV2" });
  }
  return isAdmin;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}

function formatCreditUsage(): string {
  return (
    `*Usage:* \\/admin\\_credit \\<user\\_id\\> \\<currency\\> \\<amount\\> \\<reason\\>\n\n` +
    `Currencies: \`points\`, \`crypto\`, \`custom\\_token\`\n` +
    `Example: \\/admin\\_credit 123456789 points 500 "Completed bonus challenge"`
  );
}

function formatCancelUsage(): string {
  return `*Usage:* \\/admin\\_cancel \\<challenge\\_id\\>\n\nExample: \\/admin\\_cancel 42`;
}