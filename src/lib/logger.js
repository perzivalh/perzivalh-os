function log(level, message, meta) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
  };
  if (meta && typeof meta === "object") {
    payload.meta = meta;
  }
  const output = JSON.stringify(payload);
  if (level === "error") {
    console.error(output);
    return;
  }
  if (level === "warn") {
    console.warn(output);
    return;
  }
  console.log(output);
}

module.exports = {
  info: (message, meta) => log("info", message, meta),
  warn: (message, meta) => log("warn", message, meta),
  error: (message, meta) => log("error", message, meta),
};
