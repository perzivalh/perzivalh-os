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

function normalizeBoliviaPhoneVariants(value) {
  const digits = digitsOnly(value);
  if (!digits) {
    return [];
  }

  const variants = new Set();
  const add = (entry) => {
    if (entry) {
      variants.add(entry);
    }
  };

  add(digits);
  add(`+${digits}`);

  if (digits.startsWith("591") && digits.length > 8) {
    const local = digits.slice(3);
    add(local);
    add(`+591${local}`);
  }

  if (digits.startsWith("0") && digits.length >= 8) {
    const local = digits.slice(-8);
    add(local);
    add(`+591${local}`);
  }

  if (digits.length === 8) {
    add(`+591${digits}`);
  }

  return Array.from(variants);
}

function toCanonicalBoliviaPhone(value) {
  const digits = digitsOnly(value);
  if (!digits) {
    return null;
  }
  if (digits.startsWith("591") && digits.length > 8) {
    return `+${digits}`;
  }
  if (digits.startsWith("0") && digits.length >= 8) {
    return `+591${digits.slice(-8)}`;
  }
  if (digits.length === 8) {
    return `+591${digits}`;
  }
  return `+${digits}`;
}

function toPhoneE164(value) {
  return toCanonicalBoliviaPhone(value) || "";
}

module.exports = {
  normalizeText,
  digitsOnly,
  normalizeBoliviaPhoneVariants,
  toCanonicalBoliviaPhone,
  toPhoneE164,
};
