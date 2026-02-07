const axios = require("axios");

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

module.exports = { callAiProvider };
