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
  const normalizedModel = String(model || "")
    .replace(/^models\//, "")
    .trim() || "gemini-1.5-flash";
  const url = `${GEMINI_ENDPOINT}/${normalizedModel}:generateContent?key=${apiKey}`;
  const payload = {
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
      ...(schema ? { responseSchema: schema } : {}),
    },
  };

  try {
    const response = await axios.post(url, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 20000,
    });
    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } catch (error) {
    const status = error?.response?.status;
    if (schema && status === 400) {
      const retryPayload = {
        ...payload,
        generationConfig: {
          ...payload.generationConfig,
          responseSchema: undefined,
        },
      };
      const response = await axios.post(url, retryPayload, {
        headers: { "Content-Type": "application/json" },
        timeout: 20000,
      });
      return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }
    const detail = error?.response?.data
      ? JSON.stringify(error.response.data).slice(0, 500)
      : "";
    throw new Error(
      `Gemini request failed${status ? ` (${status})` : ""}${
        detail ? `: ${detail}` : ""
      }`
    );
  }
}

async function callAiProvider(provider, options) {
  if (provider === "gemini") {
    return callGemini(options);
  }
  return callOpenAI(options);
}

module.exports = {
  callAiProvider,
};
