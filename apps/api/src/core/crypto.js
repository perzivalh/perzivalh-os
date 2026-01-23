const crypto = require("crypto");

const VERSION = "v1";
const IV_LENGTH = 12;

function normalizeKey(rawKey) {
  if (!rawKey) {
    throw new Error("MASTER_KEY missing");
  }
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, "hex");
  }
  const buffer = Buffer.from(rawKey, "base64");
  if (buffer.length === 32) {
    return buffer;
  }
  return Buffer.from(rawKey, "utf8");
}

function getKey() {
  const key = normalizeKey(process.env.MASTER_KEY || "");
  if (key.length !== 32) {
    throw new Error("MASTER_KEY must be 32 bytes");
  }
  return key;
}

function encryptString(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value);
  if (!text) {
    return "";
  }
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function decryptString(payload) {
  if (payload === null || payload === undefined) {
    return null;
  }
  const text = String(payload);
  if (!text) {
    return "";
  }
  const [version, ivB64, tagB64, dataB64] = text.split(":");
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted payload");
  }
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

module.exports = {
  encryptString,
  decryptString,
};
