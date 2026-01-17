function normalizeText(text) {
  return (text || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function digitsOnly(value) {
  return (value || "").toString().replace(/\D+/g, "");
}

function toPhoneE164(value) {
  const digits = digitsOnly(value);
  if (!digits) {
    return "";
  }
  return `+${digits}`;
}

module.exports = {
  normalizeText,
  digitsOnly,
  toPhoneE164,
};
