function shouldRedactKey(key) {
  return /(token|authorization|secret|password)/i.test(key || "");
}

function redactValue(value) {
  if (!value) {
    return value;
  }
  if (typeof value === "string" && value.length > 8) {
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  }
  return "***";
}

function redactObject(input) {
  if (Array.isArray(input)) {
    return input.map((item) => redactObject(item));
  }
  if (!input || typeof input !== "object") {
    return input;
  }
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (shouldRedactKey(key)) {
      output[key] = redactValue(value);
    } else {
      output[key] = redactObject(value);
    }
  }
  return output;
}

module.exports = {
  redactObject,
};
