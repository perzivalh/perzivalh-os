/**
 * Redis client singleton
 * Usado como caché L1 para sesiones y knowledge base
 */
const Redis = require("ioredis");
const logger = require("./logger");

let client = null;

function getRedis() {
  if (client) return client;

  const url =
    process.env.REDIS_URL ||
    process.env.REDIS_PUBLIC_URL ||
    "redis://localhost:6379";

  client = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 3) return null; // stop retrying
      return Math.min(times * 200, 1000);
    },
  });

  client.on("connect", () => {
    logger.info("redis.connected", { url: url.replace(/:[^:@]+@/, ":***@") });
  });

  client.on("error", (err) => {
    logger.warn("redis.error", { message: err.message });
  });

  client.on("close", () => {
    logger.warn("redis.disconnected");
  });

  return client;
}

/**
 * Safe GET — retorna null si Redis no está disponible
 */
async function rGet(key) {
  try {
    return await getRedis().get(key);
  } catch {
    return null;
  }
}

/**
 * Safe SET con TTL en segundos
 */
async function rSet(key, value, ttlSeconds) {
  try {
    await getRedis().set(key, value, "EX", ttlSeconds);
  } catch {
    // Redis unavailable — silently skip caching
  }
}

/**
 * Safe DEL
 */
async function rDel(key) {
  try {
    await getRedis().del(key);
  } catch {
    // no-op
  }
}

module.exports = { getRedis, rGet, rSet, rDel };
