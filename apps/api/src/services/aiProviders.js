const axios = require("axios");

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models";

function extractOpenAIText(data) {
  if (!data) {
    return "";
  }
  if (typeof data.output_text === "string") {
    return data.output_text;
  }
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === "string") {
        return part.text;
      }
      if (typeof part?.output_text === "string") {
        return part.output_text;
      }
    }
  }
  return "";
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

async function callOpenAI({
  apiKey,
  model,
  system,
  user,
  schema,
  temperature = 0,
  maxTokens = 220,
}) {
  const payload = {
    model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: system }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: user }],
      },
    ],
    text: schema
      ? {
        format: {
          type: "json_schema",
          name: "ai_router",
          schema,
          strict: true,
        },
      }
      : undefined,
    temperature,
    max_output_tokens: maxTokens,
  };

  const response = await axios.post(OPENAI_ENDPOINT, payload, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    timeout: 20000,
  });

  return extractOpenAIText(response.data);
}

async function callGemini({
  apiKey,
  model,
  system,
  user,
  schema,
  temperature = 0,
  maxTokens = 220,
}) {
  // EXTENSIVE LOGGING FOR DEBUGGING
  console.log("=".repeat(60));
  console.log("[GEMINI DEBUG] Starting Gemini call");
  console.log("[GEMINI DEBUG] API Key prefix:", apiKey ? apiKey.substring(0, 10) + "..." : "MISSING");
  console.log("[GEMINI DEBUG] API Key length:", apiKey ? apiKey.length : 0);
  console.log("[GEMINI DEBUG] Requested model from config:", model);
  console.log("[GEMINI DEBUG] System prompt length:", system?.length || 0);
  console.log("[GEMINI DEBUG] User prompt length:", user?.length || 0);
  console.log("[GEMINI DEBUG] Endpoint:", GEMINI_ENDPOINT);

  // Models to try - these should work with v1beta
  const modelCandidates = [
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-pro",
  ];

  console.log("[GEMINI DEBUG] Model candidates:", modelCandidates);

  const basePayload = {
    system_instruction: {
      parts: [{ text: system }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: user }],
      },
    ],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      responseMimeType: "application/json",
    },
  };

  console.log("[GEMINI DEBUG] Payload structure:", JSON.stringify({
    system_instruction: { parts: [{ text: "..." }] },
    contents: [{ role: "user", parts: [{ text: "..." }] }],
    generationConfig: basePayload.generationConfig,
  }, null, 2));

  let lastError = null;
  for (const candidate of modelCandidates) {
    const url = `${GEMINI_ENDPOINT}/${candidate}:generateContent?key=${apiKey}`;
    const urlForLog = `${GEMINI_ENDPOINT}/${candidate}:generateContent?key=***`;

    console.log("[GEMINI DEBUG] Trying model:", candidate);
    console.log("[GEMINI DEBUG] Full URL (masked):", urlForLog);

    try {
      const response = await axios.post(url, basePayload, {
        headers: { "Content-Type": "application/json" },
        timeout: 20000,
      });

      console.log("[GEMINI DEBUG] SUCCESS! Status:", response.status);
      console.log("[GEMINI DEBUG] Response headers:", JSON.stringify(response.headers, null, 2));
      console.log("[GEMINI DEBUG] Response data keys:", Object.keys(response.data || {}));
      console.log("[GEMINI DEBUG] Candidates count:", response.data?.candidates?.length || 0);

      const resultText = extractGeminiText(response.data);
      console.log("[GEMINI DEBUG] Extracted text length:", resultText.length);
      console.log("[GEMINI DEBUG] Extracted text preview:", resultText.substring(0, 200));
      console.log("=".repeat(60));

      return resultText;
    } catch (error) {
      const status = error?.response?.status;
      const errorData = error?.response?.data;
      const errorMessage = error?.message;

      console.error("[GEMINI DEBUG] FAILED for model:", candidate);
      console.error("[GEMINI DEBUG] Error status:", status || "N/A");
      console.error("[GEMINI DEBUG] Error message:", errorMessage);
      console.error("[GEMINI DEBUG] Error response data:", JSON.stringify(errorData, null, 2));
      console.error("[GEMINI DEBUG] Error code:", error?.code);

      lastError = error;
    }
  }

  console.error("[GEMINI DEBUG] ALL MODELS FAILED!");
  console.error("=".repeat(60));

  const status = lastError?.response?.status;
  const detail = lastError?.response?.data
    ? JSON.stringify(lastError.response.data).slice(0, 500)
    : "";
  throw new Error(
    `Gemini request failed${status ? ` (${status})` : ""}${detail ? `: ${detail}` : ""
    }`
  );
}

async function callAiProvider(provider, options) {
  console.log("[AI PROVIDER] Called with provider:", provider);
  console.log("[AI PROVIDER] Options model:", options.model);
  console.log("[AI PROVIDER] Has API key:", !!options.apiKey);

  if (provider === "gemini") {
    return callGemini(options);
  }
  return callOpenAI(options);
}

module.exports = {
  callAiProvider,
};
