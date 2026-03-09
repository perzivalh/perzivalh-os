/**
 * Media storage service — uploads files to Cloudflare R2 using S3-compatible API.
 * Uses Node.js built-in crypto for AWS4 signing (no extra npm packages needed).
 *
 * Required env vars:
 *   R2_ACCOUNT_ID         — Cloudflare account ID
 *   R2_ACCESS_KEY_ID      — R2 access key ID
 *   R2_SECRET_ACCESS_KEY  — R2 secret access key
 *   R2_BUCKET_NAME        — bucket name
 *   R2_PUBLIC_URL         — public base URL, e.g. https://pub.example.com or https://{bucket}.{account}.r2.dev
 */

const crypto = require("crypto");
const axios = require("axios");
const logger = require("../lib/logger");

const REGION = "auto";
const SERVICE = "s3";

function isConfigured() {
    return Boolean(
        process.env.R2_ACCOUNT_ID &&
        process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY &&
        process.env.R2_BUCKET_NAME &&
        process.env.R2_PUBLIC_URL
    );
}

// ─── AWS4 minimal signer ───────────────────────────────────────────────────────

function sha256Hex(data) {
    return crypto.createHash("sha256").update(data).digest("hex");
}

function hmacSha256(key, data) {
    return crypto.createHmac("sha256", key).update(data).digest();
}

function getSigningKey(secretKey, dateStamp) {
    const kDate = hmacSha256("AWS4" + secretKey, dateStamp);
    const kRegion = hmacSha256(kDate, REGION);
    const kService = hmacSha256(kRegion, SERVICE);
    return hmacSha256(kService, "aws4_request");
}

function getDatetime(date = new Date()) {
    return date.toISOString().replace(/[:\-]|\.\d{3}/g, "").slice(0, 15) + "Z";
}

function getDateStamp(datetime) {
    return datetime.slice(0, 8);
}

function buildAuthHeaders({ host, objectKey, contentType, bodyHash, datetime }) {
    const dateStamp = getDateStamp(datetime);
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;

    const canonicalPath = `/${encodeURIComponent(objectKey).replace(/%2F/g, "/")}`;
    const signedHeaderKeys = "content-type;host;x-amz-content-sha256;x-amz-date";
    const canonicalHeaders =
        `content-type:${contentType}\n` +
        `host:${host}\n` +
        `x-amz-content-sha256:${bodyHash}\n` +
        `x-amz-date:${datetime}\n`;

    const canonicalRequest = [
        "PUT",
        canonicalPath,
        "", // no query string
        canonicalHeaders,
        signedHeaderKeys,
        bodyHash,
    ].join("\n");

    const stringToSign = [
        "AWS4-HMAC-SHA256",
        datetime,
        credentialScope,
        sha256Hex(canonicalRequest),
    ].join("\n");

    const signingKey = getSigningKey(secretAccessKey, dateStamp);
    const signature = hmacSha256(signingKey, stringToSign).toString("hex");

    return {
        Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaderKeys}, Signature=${signature}`,
        "x-amz-date": datetime,
        "x-amz-content-sha256": bodyHash,
        "content-type": contentType,
        host,
    };
}

// ─── MIME helpers ─────────────────────────────────────────────────────────────

function mimeToExtension(mimeType) {
    const map = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
        "video/mp4": "mp4",
        "video/webm": "webm",
        "audio/ogg": "ogg",
        "audio/mpeg": "mp3",
        "audio/mp4": "m4a",
        "audio/ogg; codecs=opus": "ogg",
        "application/pdf": "pdf",
        "application/msword": "doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        "application/vnd.ms-excel": "xls",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
        "text/plain": "txt",
    };
    const base = String(mimeType || "").split(";")[0].trim().toLowerCase();
    return map[base] || map[mimeType] || "bin";
}

function buildObjectKey(type, mimeType, filename) {
    const now = new Date();
    const datePath = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const rand = crypto.randomBytes(8).toString("hex");
    const ext = filename
        ? filename.split(".").pop().toLowerCase()
        : mimeToExtension(mimeType);
    const cleanName = filename
        ? filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60)
        : `${type}_${rand}.${ext}`;
    return `media/${type}/${datePath}/${rand}_${cleanName}`;
}

// ─── Upload ───────────────────────────────────────────────────────────────────

/**
 * Upload a buffer to Cloudflare R2.
 * @param {{ buffer: Buffer, mimeType: string, type: string, filename?: string }} opts
 * @returns {Promise<{ url: string, objectKey: string }>}
 */
async function uploadToR2({ buffer, mimeType, type = "misc", filename }) {
    if (!isConfigured()) {
        throw new Error("R2 not configured — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL");
    }

    const accountId = process.env.R2_ACCOUNT_ID;
    const bucketName = process.env.R2_BUCKET_NAME;
    const publicBaseUrl = process.env.R2_PUBLIC_URL.replace(/\/$/, "");

    const host = `${accountId}.r2.cloudflarestorage.com`;
    const objectKey = buildObjectKey(type, mimeType, filename);
    const datetime = getDatetime();
    const bodyHash = sha256Hex(buffer);
    const contentType = String(mimeType || "application/octet-stream").split(";")[0].trim();

    const authHeaders = buildAuthHeaders({ host, objectKey, contentType, bodyHash, datetime });

    const uploadUrl = `https://${host}/${bucketName}/${objectKey}`;

    await axios.put(uploadUrl, buffer, {
        headers: {
            ...authHeaders,
            "content-length": buffer.length,
        },
        maxBodyLength: Infinity,
        timeout: 30000,
    });

    const publicUrl = `${publicBaseUrl}/${objectKey}`;
    logger.info("media.uploaded_to_r2", { objectKey, contentType, bytes: buffer.length });
    return { url: publicUrl, objectKey };
}

module.exports = { uploadToR2, isConfigured };
