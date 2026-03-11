const { normalizeText } = require("../lib/normalize");

const TAG_UNERO = "u\u00f1ero";

const TAG_ALIAS_MAP = new Map([
  ["unero", TAG_UNERO],
  ["onicomicosis", "hongos"],
  ["hongos onicomicosis", "hongos"],
  ["hongo en unas", "hongos"],
  ["hongo en unas onicomicosis", "hongos"],
  ["hongos en unas", "hongos"],
  ["hongos en unas onicomicosis", "hongos"],
]);

function normalizeTagKey(value) {
  return normalizeText(value || "")
    .replace(/[()\/]+/g, " ")
    .replace(/[^\w\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeTagName(value) {
  const raw = String(value || "").trim().replace(/\s+/g, " ");
  if (!raw) {
    return "";
  }

  const normalizedRaw = raw.toLowerCase();
  return TAG_ALIAS_MAP.get(normalizeTagKey(normalizedRaw)) || normalizedRaw;
}

function normalizeTagNames(tags) {
  const values = Array.isArray(tags) ? tags : [tags];
  const normalized = [];
  const seen = new Set();

  for (const value of values) {
    const canonical = canonicalizeTagName(value);
    const key = normalizeTagKey(canonical);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(canonical);
  }

  return normalized;
}

module.exports = {
  canonicalizeTagName,
  normalizeTagKey,
  normalizeTagNames,
};
