const prisma = require("../db");
const logger = require("../lib/logger");
const { normalizePhone } = require("./odooClient");
const { createTagWithAudience } = require("./audienceAutomationService");
const audienceService = require("./audienceService");

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_ROWS = 50000;

function decodeXml(input = "") {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(field.trim());
      field = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(field.trim());
      if (row.some((cell) => cell !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }
    field += char;
  }
  if (field.length || row.length) {
    row.push(field.trim());
    if (row.some((cell) => cell !== "")) {
      rows.push(row);
    }
  }
  return rows;
}

function findEocd(buffer) {
  const sig = 0x06054b50;
  const maxSearch = Math.max(0, buffer.length - 65536);
  for (let i = buffer.length - 22; i >= maxSearch; i -= 1) {
    if (buffer.readUInt32LE(i) === sig) {
      return {
        offset: i,
        centralDirSize: buffer.readUInt32LE(i + 12),
        centralDirOffset: buffer.readUInt32LE(i + 16),
      };
    }
  }
  return null;
}

function unzipEntries(buffer) {
  const zlib = require("zlib");
  const eocd = findEocd(buffer);
  if (!eocd) {
    throw new Error("zip_invalid");
  }
  const entries = {};
  let offset = eocd.centralDirOffset;
  const end = eocd.centralDirOffset + eocd.centralDirSize;
  while (offset < end) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      break;
    }
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer
      .slice(offset + 46, offset + 46 + nameLen)
      .toString("utf8");

    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    let data = null;
    if (compression === 0) {
      data = compressed;
    } else if (compression === 8) {
      data = zlib.inflateRawSync(compressed);
    }
    if (data) {
      entries[name] = data;
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function colToIndex(col) {
  let result = 0;
  for (let i = 0; i < col.length; i += 1) {
    result = result * 26 + (col.charCodeAt(i) - 64);
  }
  return result - 1;
}

function parseXlsx(buffer) {
  const entries = unzipEntries(buffer);
  const shared = entries["xl/sharedStrings.xml"];
  const sheet = entries["xl/worksheets/sheet1.xml"];
  if (!sheet) {
    throw new Error("xlsx_missing_sheet");
  }

  const sharedStrings = [];
  if (shared) {
    const text = shared.toString("utf8");
    const matches = text.matchAll(/<t[^>]*>(.*?)<\/t>/g);
    for (const match of matches) {
      sharedStrings.push(decodeXml(match[1]));
    }
  }

  const sheetText = sheet.toString("utf8");
  const rows = [];
  const rowMatches = sheetText.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g);
  for (const rowMatch of rowMatches) {
    const rowXml = rowMatch[1];
    const row = [];
    const cellMatches = rowXml.matchAll(/<c[^>]*r="([A-Z]+)\d+"[^>]*>([\s\S]*?)<\/c>/g);
    for (const cellMatch of cellMatches) {
      const col = cellMatch[1];
      const cellXml = cellMatch[2];
      const typeMatch = cellMatch[0].match(/t="([^"]+)"/);
      const valueMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/);
      const valueRaw = valueMatch ? valueMatch[1] : "";
      let value = valueRaw;
      if (typeMatch && typeMatch[1] === "s") {
        value = sharedStrings[parseInt(valueRaw || "0", 10)] || "";
      }
      row[colToIndex(col)] = decodeXml(String(value));
    }
    if (row.some((cell) => cell && String(cell).trim() !== "")) {
      rows.push(row.map((cell) => (cell !== undefined ? String(cell).trim() : "")));
    }
  }
  return rows;
}

function parseImportFile({ filename, buffer }) {
  if (!buffer || buffer.length === 0) {
    throw new Error("file_empty");
  }
  if (buffer.length > MAX_BYTES) {
    throw new Error("file_too_large");
  }
  const lower = (filename || "").toLowerCase();
  if (lower.endsWith(".csv")) {
    return parseCsv(buffer.toString("utf8"));
  }
  if (lower.endsWith(".xlsx")) {
    return parseXlsx(buffer);
  }
  throw new Error("file_type_not_supported");
}

function detectMapping(columns = []) {
  return columns.map((col) => {
    const lower = col.toLowerCase();
    if (lower.includes("phone") || lower.includes("telefono") || lower.includes("tel")) {
      return "phone";
    }
    if (lower.includes("name") || lower.includes("nombre")) {
      return "name";
    }
    if (lower.includes("city") || lower.includes("ciudad")) {
      return "city";
    }
    if (lower.includes("tag")) {
      return "tags";
    }
    return "ignore";
  });
}

function parseTags(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(/[;,|]/g)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

async function previewImport({ fileBase64, filename }) {
  if (!fileBase64) {
    throw new Error("file_missing");
  }
  const buffer = Buffer.from(fileBase64, "base64");
  const rows = parseImportFile({ filename, buffer });
  if (rows.length === 0) {
    return { columns: [], previewRows: [], totalRows: 0 };
  }
  const columns = rows[0].map((col, idx) => col || `Columna ${idx + 1}`);
  const mapping = detectMapping(columns);
  const previewRows = rows.slice(1, 6);
  return {
    columns,
    mapping,
    previewRows,
    totalRows: Math.max(0, rows.length - 1),
  };
}

async function importContacts({
  fileBase64,
  filename,
  mapping,
  options = {},
  userId,
}) {
  if (!fileBase64) {
    throw new Error("file_missing");
  }
  const buffer = Buffer.from(fileBase64, "base64");
  const rows = parseImportFile({ filename, buffer });
  if (rows.length === 0) {
    throw new Error("file_empty");
  }
  if (rows.length - 1 > MAX_ROWS) {
    throw new Error("rows_limit_exceeded");
  }

  const columns = rows[0];
  const resolvedMapping = mapping?.length ? mapping : detectMapping(columns);
  const mapByIndex = new Map();
  resolvedMapping.forEach((field, idx) => {
    mapByIndex.set(idx, field);
  });

  let phoneIndex = null;
  for (const [idx, field] of mapByIndex.entries()) {
    if (field === "phone") {
      phoneIndex = idx;
      break;
    }
  }
  if (phoneIndex === null) {
    throw new Error("phone_column_required");
  }

  let baseTagName = options.baseTagName || null;
  if (options.targetSegmentId && !baseTagName) {
    const segment = await prisma.audienceSegment.findUnique({
      where: { id: options.targetSegmentId },
      select: { name: true },
    });
    baseTagName = segment?.name || null;
  }

  const tagsIndex = [...mapByIndex.entries()].find(([, field]) => field === "tags")?.[0];
  if (!baseTagName && tagsIndex === undefined) {
    throw new Error("audience_name_required");
  }

  const importRef = `import_${Date.now()}`;
  let processed = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const touchedTags = new Set();

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const rawPhone = row[phoneIndex];
    if (!rawPhone) {
      errors++;
      continue;
    }
    const variants = normalizePhone(rawPhone);
    const phoneE164 =
      variants.find((value) => value.startsWith("+")) ||
      (variants[0] ? `+591${variants[0]}` : null);
    if (!phoneE164) {
      errors++;
      continue;
    }

    processed++;
    const nameIndex = [...mapByIndex.entries()].find(([, field]) => field === "name")?.[0];
    const cityIndex = [...mapByIndex.entries()].find(([, field]) => field === "city")?.[0];

    const contactName = nameIndex !== undefined ? row[nameIndex] : null;
    const city = cityIndex !== undefined ? row[cityIndex] : null;
    let tags = tagsIndex !== undefined ? parseTags(row[tagsIndex]) : [];
    if (tags.length === 0 && baseTagName) {
      tags = [baseTagName];
    }
    if (options.prefix) {
      tags = tags.map((tag) =>
        tag.startsWith(options.prefix) ? tag : `${options.prefix}${tag}`.trim()
      );
    }

    if (options.ignoreDuplicates) {
      const exists = await prisma.importedContact.findFirst({
        where: { phone_e164: phoneE164 },
        select: { id: true },
      });
      if (exists) {
        skipped++;
        continue;
      }
    }

    const existing = await prisma.importedContact.findFirst({
      where: { phone_e164: phoneE164 },
      select: { id: true },
    });

    if (existing) {
      await prisma.importedContact.update({
        where: { id: existing.id },
        data: {
          name: contactName || null,
          city: city || null,
          tags_json: tags,
          source_ref: importRef,
        },
      });
      updated++;
    } else {
      await prisma.importedContact.create({
        data: {
          phone_e164: phoneE164,
          name: contactName || null,
          city: city || null,
          tags_json: tags,
          source: "excel",
          source_ref: importRef,
        },
      });
      created++;
    }

    for (const tag of tags) {
      if (!tag) continue;
      await createTagWithAudience({
        name: tag,
        phoneNumberId: options.phoneNumberId || null,
        userId,
      });
      touchedTags.add(tag);
    }
  }

  for (const tagName of touchedTags) {
    const tag = await prisma.tag.findUnique({
      where: { name: tagName },
      select: { id: true },
    });
    if (!tag) continue;
    const mapping = await prisma.audienceTag.findFirst({
      where: { tag_id: tag.id },
      select: { segment_id: true },
    });
    if (!mapping) continue;
    const count = await audienceService.estimateRecipientCount(mapping.segment_id);
    await prisma.audienceSegment.update({
      where: { id: mapping.segment_id },
      data: { estimated_count: count, last_synced_at: new Date() },
    });
  }

  logger.info("Import contacts completed", {
    processed,
    created,
    updated,
    skipped,
    errors,
  });

  return {
    processed,
    created,
    updated,
    skipped,
    errors,
    importRef,
  };
}

module.exports = {
  previewImport,
  importContacts,
};
