const axios = require("axios");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

function extractOpenAIText(data) {
  if (!data) return "";
  if (typeof data.output_text === "string") return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === "string") return part.text;
      if (typeof part?.output_text === "string") return part.output_text;
    }
  }
  return "";
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

async function callOpenAI({ apiKey, model, system, user, schema, temperature = 0, maxTokens = 220 }) {
  const payload = {
    model,
    input: [
      { role: "system", content: [{ type: "input_text", text: system }] },
      { role: "user", content: [{ type: "input_text", text: user }] },
    ],
    text: schema ? { format: { type: "json_schema", name: "ai_router", schema, strict: true } } : undefined,
    temperature,
    max_output_tokens: maxTokens,
  };

  const response = await axios.post(OPENAI_ENDPOINT, payload, {
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    timeout: 20000,
  });
  return extractOpenAIText(response.data);
}

async function callGemini({ apiKey, model, system, user, schema, temperature = 0, maxTokens = 220 }) {
  console.log("=".repeat(60));
  console.log("[GEMINI] Starting call");
  console.log("[GEMINI] API Key prefix:", apiKey ? apiKey.substring(0, 12) + "..." : "MISSING");

  // STEP 1: List available models to find what we can use
  let availableGenerateModels = [];
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    console.log("[GEMINI] Listing available models...");
    const listResponse = await axios.get(listUrl, { timeout: 10000 });
    const allModels = listResponse.data?.models || [];
    console.log("[GEMINI] Total models found:", allModels.length);

    // Filter to only models that support generateContent
    availableGenerateModels = allModels
      .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
      .map(m => m.name.replace("models/", ""));

    console.log("[GEMINI] Models with generateContent support:", JSON.stringify(availableGenerateModels));
  } catch (listError) {
    console.error("[GEMINI] Failed to list models:", listError.message);
    console.error("[GEMINI] Error details:", JSON.stringify(listError.response?.data || {}));
  }

  // STEP 2: Pick models to try - prefer discovered models, fallback to known ones
  const modelCandidates = availableGenerateModels.length > 0
    ? availableGenerateModels.slice(0, 5)  // Use first 5 discovered models
    : ["gemini-2.0-flash-exp", "gemini-1.5-flash-8b", "gemini-1.0-pro", "gemini-pro"];

  console.log("[GEMINI] Will try these models:", modelCandidates);

  const basePayload = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      responseMimeType: "application/json",
    },
  };

  let lastError = null;
  for (const candidate of modelCandidates) {
    const url = `${GEMINI_ENDPOINT}/${candidate}:generateContent?key=${apiKey}`;
    console.log("[GEMINI] Trying:", candidate);

    try {
      const response = await axios.post(url, basePayload, {
        headers: { "Content-Type": "application/json" },
        timeout: 20000,
      });

      console.log("[GEMINI] SUCCESS with model:", candidate);
      const resultText = extractGeminiText(response.data);
      console.log("[GEMINI] Response length:", resultText.length);
      console.log("[GEMINI] Preview:", resultText.substring(0, 150));
      console.log("=".repeat(60));
      return resultText;
    } catch (error) {
      console.error("[GEMINI] FAILED:", candidate, "status:", error?.response?.status || "N/A");
      console.error("[GEMINI] Error:", JSON.stringify(error?.response?.data || { message: error.message }));
      lastError = error;
    }
  }

  console.error("[GEMINI] ALL MODELS FAILED!");
  console.error("=".repeat(60));

  const status = lastError?.response?.status;
  const detail = lastError?.response?.data ? JSON.stringify(lastError.response.data).slice(0, 500) : "";
  throw new Error(`Gemini request failed${status ? ` (${status})` : ""}${detail ? `: ${detail}` : ""}`);
}

async function callAiProvider(provider, options) {
  console.log("[AI] Provider:", provider, "| Model:", options.model, "| Has key:", !!options.apiKey);
  if (provider === "gemini") {
    return callGemini(options);
  }
  return callOpenAI(options);
}

// ----------------------------------------------------------------------------
// AUDIO TRANSCRIPTION
// ----------------------------------------------------------------------------

async function transcribeAudioOpenAI({ apiKey, audioBuffer, mimeType }) {
  // Use FormData to send the audio file to Whisper API
  const FormData = require("form-data");
  const form = new FormData();

  // Determine file extension based on mimeType
  let filename = "audio.ogg";
  if (mimeType?.includes("mp4")) filename = "audio.mp4";
  else if (mimeType?.includes("mpeg") || mimeType?.includes("mp3")) filename = "audio.mp3";
  else if (mimeType?.includes("wav")) filename = "audio.wav";

  form.append("file", audioBuffer, {
    filename,
    contentType: mimeType || "audio/ogg",
  });
  form.append("model", "whisper-1");

  try {
    const response = await axios.post("https://api.openai.com/v1/audio/transcriptions", form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 30000,
    });
    return response.data?.text || "";
  } catch (error) {
    const status = error.response?.status;
    const detail = error.response?.data ? JSON.stringify(error.response.data).slice(0, 500) : "";
    throw new Error(`OpenAI transcription request failed${status ? ` (${status})` : ""}${detail ? `: ${detail}` : ""}`);
  }
}

function pickAudioExtension(mimeType) {
  if (mimeType?.includes("mp4")) return ".mp4";
  if (mimeType?.includes("mpeg") || mimeType?.includes("mp3")) return ".mp3";
  if (mimeType?.includes("wav")) return ".wav";
  if (mimeType?.includes("webm")) return ".webm";
  return ".ogg";
}

async function transcribeAudioFasterWhisper({ audioBuffer, mimeType }) {
  const enabled = String(process.env.FASTER_WHISPER_ENABLED || "true").toLowerCase();
  if (enabled === "0" || enabled === "false" || enabled === "off") {
    throw new Error("faster-whisper disabled by FASTER_WHISPER_ENABLED");
  }

  const scriptPath = path.join(__dirname, "..", "..", "scripts", "transcribe_faster_whisper.py");
  const ext = pickAudioExtension(mimeType);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wa-audio-"));
  const audioPath = path.join(tmpDir, `input${ext}`);
  console.log("[FASTER-WHISPER] Preparing transcription", JSON.stringify({
    mimeType: mimeType || "unknown",
    extension: ext,
    bytes: audioBuffer?.length || 0,
    scriptPath,
    tmpDir,
  }));

  const pythonCandidates = [
    process.env.FASTER_WHISPER_PYTHON_BIN,
    "python",
    "python3",
  ].filter(Boolean);
  console.log("[FASTER-WHISPER] Python candidates:", pythonCandidates.join(", "));

  await fs.writeFile(audioPath, audioBuffer);

  let lastError = null;
  try {
    for (const pythonBin of pythonCandidates) {
      try {
        console.log(`[FASTER-WHISPER] Trying python bin: ${pythonBin}`);
        const result = await runFasterWhisperProcess({
          pythonBin,
          scriptPath,
          audioPath,
          mimeType,
        });
        console.log("[FASTER-WHISPER] Text preview:", String(result).slice(0, 180));
        return result;
      } catch (error) {
        lastError = error;
        console.warn(`[FASTER-WHISPER] Failed with ${pythonBin}:`, error.message);
      }
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }

  throw lastError || new Error("faster-whisper transcription failed");
}

function runFasterWhisperProcess({ pythonBin, scriptPath, audioPath, mimeType }) {
  return new Promise((resolve, reject) => {
    const args = [scriptPath, audioPath];
    const startedAt = Date.now();
    let settled = false;
    const child = spawn(pythonBin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        FASTER_WHISPER_MIME_TYPE: mimeType || "",
      },
    });

    let stdout = "";
    let stderr = "";
    let timeoutHit = false;
    const timeoutMs = Number(process.env.FASTER_WHISPER_TIMEOUT_MS || 120000);
    const timer = setTimeout(() => {
      timeoutHit = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.error("[FASTER-WHISPER] Spawn error:", error.message);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const elapsedMs = Date.now() - startedAt;
      if (timeoutHit) {
        return reject(new Error(`faster-whisper process timeout after ${timeoutMs}ms (elapsed=${elapsedMs}ms)`));
      }

      const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const lastLine = lines[lines.length - 1] || "";

      if (code !== 0) {
        const detail = (stderr || lastLine || "").slice(0, 1200);
        console.error("[FASTER-WHISPER] Non-zero exit", JSON.stringify({
          code,
          elapsedMs,
          stdoutTail: stdout.slice(-400),
          stderrTail: stderr.slice(-400),
        }));
        return reject(new Error(`faster-whisper exit ${code}: ${detail}`));
      }

      try {
        const parsed = JSON.parse(lastLine);
        if (parsed?.error) {
          return reject(new Error(parsed.error));
        }
        console.log("[FASTER-WHISPER] Process success", JSON.stringify({
          code,
          elapsedMs,
          language: parsed?.language || null,
          duration: parsed?.duration || null,
          textLength: String(parsed?.text || "").length,
        }));
        resolve(String(parsed?.text || "").trim());
      } catch (error) {
        console.error("[FASTER-WHISPER] JSON parse failure", JSON.stringify({
          code,
          elapsedMs,
          stdoutTail: stdout.slice(-500),
          stderrTail: stderr.slice(-500),
        }));
        reject(new Error(`faster-whisper invalid JSON output: ${(lastLine || stdout).slice(0, 500)}`));
      }
    });
  });
}

async function transcribeAudioGemini({ apiKey, audioBuffer, mimeType }) {
  console.log("=".repeat(60));
  console.log("[GEMINI-AUDIO] Starting transcription call");

  // STEP 1: List models natively (reusing the same robust logic as text generation)
  let availableGenerateModels = [];
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const listResponse = await axios.get(listUrl, { timeout: 10000 });
    const allModels = listResponse.data?.models || [];

    // Filter to generateContent models
    availableGenerateModels = allModels
      .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
      .map(m => m.name.replace("models/", ""));
  } catch (listError) {
    console.error("[GEMINI-AUDIO] Failed to list models:", listError.message);
  }

  // STEP 2: Candidates to try
  const modelCandidates = availableGenerateModels.length > 0
    ? availableGenerateModels.slice(0, 5)
    : ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-exp"];

  // Prepare payload
  const base64Audio = audioBuffer.toString("base64");
  const payload = {
    system_instruction: { parts: [{ text: "Eres un asistente de transcripción experto. Tu única tarea es transcribir el audio al texto español exacto, sin agregar notas, descripciones ni explicaciones adicionales." }] },
    contents: [{
      role: "user",
      parts: [
        { text: "Por favor transcribe este mensaje de audio:" },
        {
          inlineData: {
            mimeType: mimeType || "audio/ogg",
            data: base64Audio
          }
        }
      ]
    }],
    generationConfig: {
      temperature: 0,
    }
  };

  let lastError = null;
  for (const candidate of modelCandidates) {
    const url = `${GEMINI_ENDPOINT}/${candidate}:generateContent?key=${apiKey}`;
    console.log("[GEMINI-AUDIO] Trying:", candidate);

    try {
      const response = await axios.post(url, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      });

      console.log("[GEMINI-AUDIO] SUCCESS with model:", candidate);
      const resultText = extractGeminiText(response.data);
      console.log("=".repeat(60));
      return resultText;
    } catch (error) {
      console.error("[GEMINI-AUDIO] FAILED:", candidate, "status:", error?.response?.status || "N/A");
      lastError = error;
    }
  }

  console.error("[GEMINI-AUDIO] ALL MODELS FAILED!");
  console.error("=".repeat(60));
  const status = lastError?.response?.status;
  const detail = lastError?.response?.data ? JSON.stringify(lastError.response.data).slice(0, 500) : "";
  const wrapped = new Error(`Gemini audio request failed${status ? ` (${status})` : ""}${detail ? `: ${detail}` : ""}`);
  wrapped.status = status;
  wrapped.provider = "gemini";
  wrapped.kind = "audio_transcription";
  throw wrapped;
}

function isQuotaOrRateLimitError(error) {
  const status = error?.status || error?.response?.status;
  const message = String(error?.message || "").toLowerCase();
  if (status === 429) return true;
  return message.includes("quota exceeded") || message.includes("rate limit");
}

async function transcribeAudio({ provider, apiKey, audioBuffer, mimeType }) {
  console.log("[AI-AUDIO] Provider:", provider, "| Has key:", !!apiKey);
  if (!audioBuffer) {
    throw new Error("audioBuffer is required");
  }

  const transcriptionProvider = (process.env.AUDIO_TRANSCRIPTION_PROVIDER || "faster-whisper").toLowerCase();

  if (transcriptionProvider === "faster-whisper" || transcriptionProvider === "local") {
    try {
      console.log("[AI-AUDIO] Trying local transcription with faster-whisper", JSON.stringify({
        model: process.env.FASTER_WHISPER_MODEL || "base",
        device: process.env.FASTER_WHISPER_DEVICE || "cpu",
        computeType: process.env.FASTER_WHISPER_COMPUTE_TYPE || "int8",
        strictLocal: String(process.env.AUDIO_TRANSCRIPTION_STRICT_LOCAL || "false"),
      }));
      const text = await transcribeAudioFasterWhisper({ audioBuffer, mimeType });
      console.log("[AI-AUDIO] faster-whisper SUCCESS");
      return text;
    } catch (error) {
      console.warn("[AI-AUDIO] faster-whisper FAILED, fallback to configured provider:", error.message);
      if (String(process.env.AUDIO_TRANSCRIPTION_STRICT_LOCAL || "false").toLowerCase() === "true") {
        throw error;
      }
    }
  }

  if (provider === "gemini") {
    try {
      return await transcribeAudioGemini({ apiKey, audioBuffer, mimeType });
    } catch (error) {
      const openAiKey = process.env.OPENAI_API_KEY;
      if (isQuotaOrRateLimitError(error) && openAiKey) {
        console.warn("[AI-AUDIO] Gemini quota/rate-limit detected. Falling back to OpenAI Whisper.");
        return transcribeAudioOpenAI({ apiKey: openAiKey, audioBuffer, mimeType });
      }
      throw error;
    }
  }
  return transcribeAudioOpenAI({ apiKey, audioBuffer, mimeType });
}

module.exports = { callAiProvider, transcribeAudio };
