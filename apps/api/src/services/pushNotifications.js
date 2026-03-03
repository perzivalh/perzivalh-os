const webPush = require("web-push");

const prisma = require("../db");
const logger = require("../lib/logger");
const { getTenantContext } = require("../tenancy/tenantContext");

const VAPID_PUBLIC_KEY = String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || "").trim();
const VAPID_PRIVATE_KEY = String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY || "").trim();
const VAPID_SUBJECT = String(
  process.env.WEB_PUSH_VAPID_SUBJECT || "mailto:notificaciones@perzivalh.local"
).trim();

let vapidReady = false;

function isPushConfigured() {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

function ensureVapidConfig() {
  if (!isPushConfigured()) {
    return false;
  }
  if (vapidReady) {
    return true;
  }
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidReady = true;
  return true;
}

function getPushPublicKey() {
  return isPushConfigured() ? VAPID_PUBLIC_KEY : null;
}

function normalizeSubscription(input) {
  const endpoint = String(input?.endpoint || "").trim();
  const p256dh = String(input?.keys?.p256dh || "").trim();
  const auth = String(input?.keys?.auth || "").trim();
  if (!endpoint || !p256dh || !auth) {
    throw new Error("invalid_push_subscription");
  }
  return {
    endpoint,
    p256dh,
    auth,
  };
}

function truncateBody(text, max = 160) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function buildPushPayload({ conversation, message, trigger }) {
  const contactLabel =
    conversation.display_name ||
    conversation.phone_e164 ||
    conversation.wa_id ||
    "Un contacto";
  const messagePreview =
    message?.direction === "in"
      ? truncateBody(
        message.text ||
        (message.type && message.type !== "text"
          ? `Nuevo mensaje [${message.type}]`
          : "Nuevo mensaje")
      )
      : "";

  const title =
    trigger === "pending_message"
      ? "Nuevo mensaje en conversación pendiente"
      : "Nueva conversación pendiente";
  const body = messagePreview
    ? `${contactLabel}: ${messagePreview}`
    : `${contactLabel} requiere atención de un operador.`;

  return {
    title,
    body,
    icon: "/pwa-icon-192-v8.png",
    badge: "/pwa-icon-192-v8.png",
    tag: `pending-${conversation.id}`,
    renotify: true,
    requireInteraction: false,
    data: {
      url: "/",
      conversationId: conversation.id,
      trigger,
    },
  };
}

async function savePushSubscription({
  userId,
  subscription,
  deviceLabel,
  userAgent,
}) {
  if (!isPushConfigured()) {
    throw new Error("push_disabled");
  }
  if (!userId) {
    throw new Error("user_required");
  }
  const normalized = normalizeSubscription(subscription);
  const now = new Date();

  return prisma.pushSubscription.upsert({
    where: { endpoint: normalized.endpoint },
    update: {
      user_id: userId,
      p256dh: normalized.p256dh,
      auth: normalized.auth,
      device_label: deviceLabel || null,
      user_agent: userAgent || null,
      last_used_at: now,
    },
    create: {
      user_id: userId,
      endpoint: normalized.endpoint,
      p256dh: normalized.p256dh,
      auth: normalized.auth,
      device_label: deviceLabel || null,
      user_agent: userAgent || null,
      last_used_at: now,
    },
  });
}

async function removePushSubscription({ userId, endpoint }) {
  const normalizedEndpoint = String(endpoint || "").trim();
  if (!normalizedEndpoint) {
    return 0;
  }
  const result = await prisma.pushSubscription.deleteMany({
    where: {
      endpoint: normalizedEndpoint,
      ...(userId ? { user_id: userId } : {}),
    },
  });
  return result.count;
}

async function pruneInvalidSubscription(endpoint) {
  try {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint },
    });
  } catch (error) {
    logger.warn("push.subscription_prune_failed", {
      endpoint,
      message: error.message || error,
    });
  }
}

async function sendPendingConversationPush({
  conversation,
  message = null,
  trigger = "pending_status",
}) {
  try {
    if (!conversation || conversation.status !== "pending" || conversation.assigned_user_id) {
      return { skipped: "not_pending" };
    }
    if (!ensureVapidConfig()) {
      return { skipped: "push_disabled" };
    }

    const subscriptions = await prisma.pushSubscription.findMany({
      where: {
        user: {
          is_active: true,
        },
      },
      select: {
        endpoint: true,
        p256dh: true,
        auth: true,
      },
    });

    if (!subscriptions.length) {
      return { skipped: "no_subscribers" };
    }

    const payload = JSON.stringify(buildPushPayload({ conversation, message, trigger }));
    const tenantId = getTenantContext().tenantId || null;

    let sent = 0;
    for (const subscription of subscriptions) {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload
        );
        sent += 1;
      } catch (error) {
        const statusCode = Number(error?.statusCode || 0);
        logger.warn("push.send_failed", {
          tenantId,
          endpoint: subscription.endpoint,
          statusCode: statusCode || null,
          message: error?.body || error?.message || error,
        });
        if (statusCode === 404 || statusCode === 410) {
          await pruneInvalidSubscription(subscription.endpoint);
        }
      }
    }

    if (sent > 0) {
      logger.info("push.sent", {
        tenantId,
        trigger,
        conversationId: conversation.id,
        sent,
      });
    }

    return { sent };
  } catch (error) {
    logger.warn("push.send_skipped", {
      trigger,
      conversationId: conversation?.id || null,
      message: error?.message || error,
    });
    return { skipped: "push_failed" };
  }
}

module.exports = {
  getPushPublicKey,
  isPushConfigured,
  savePushSubscription,
  removePushSubscription,
  sendPendingConversationPush,
};
