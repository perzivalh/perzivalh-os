const logger = require("../lib/logger");
const { normalizeText } = require("../lib/normalize");
const { callAiProvider } = require("./aiProviders");

const DEFAULT_MODELS = {
  openai: "gpt-4o-mini",
  gemini: "gemini-1.5-flash",
};

const ROUTER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ["route", "menu", "services", "handoff"],
    },
    route_id: { type: "string" },
  },
  required: ["action"],
};

function normalizeLabel(value) {
  return normalizeText(value || "").replace(/\s+/g, " ").trim();
}

function buildNodeMap(flow) {
  const map = new Map();
  for (const node of flow.nodes || []) {
    if (node?.id) {
      map.set(node.id, node);
    }
  }
  return map;
}

function summarizeNode(node) {
  const raw = (node?.text || node?.title || "").toString().trim();
  if (!raw) {
    return "";
  }
  const firstLine = raw.split("\n")[0].trim();
  return firstLine.slice(0, 120);
}

function buildRouteCandidates(flow) {
  const nodeMap = buildNodeMap(flow);
  const candidates = new Map();
  const excluded = new Set(
    [flow.ai?.handoff_node_id, "CONTACT_METHOD"].filter(Boolean)
  );

  for (const node of flow.nodes || []) {
    if (!Array.isArray(node?.buttons)) {
      continue;
    }
    for (const btn of node.buttons) {
      const nextId = btn?.next;
      if (!nextId || excluded.has(nextId)) {
        continue;
      }
      const target = nodeMap.get(nextId);
      if (target?.type === "action") {
        continue;
      }
      if (!candidates.has(nextId)) {
        candidates.set(nextId, {
          id: nextId,
          labels: new Set(),
          summary: summarizeNode(target),
          keywords: new Set(
            nextId
              .split("_")
              .map((part) => normalizeLabel(part))
              .filter(Boolean)
          ),
        });
      }
      const entry = candidates.get(nextId);
      if (btn?.label) {
        entry.labels.add(btn.label);
      }
    }
  }

  return Array.from(candidates.values()).map((item) => ({
    id: item.id,
    labels: Array.from(item.labels),
    summary: item.summary,
    keywords: Array.from(item.keywords),
  }));
}

function buildSystemPrompt() {
  return [
    "Eres un enrutador de intenciones para un bot de una clínica podológica.",
    "Tu objetivo es llevar al usuario al flujo correcto con la menor cantidad de mensajes.",
    "Responde SOLO con JSON válido según el esquema.",
    "Reglas:",
    "- Si el mensaje describe síntomas, dolor o dudas médicas complejas: action=handoff.",
    "- Si el mensaje está fuera de tema: action=menu.",
    "- Si no se identifica el servicio: action=services.",
    "- Si se identifica un servicio o tema del flujo: action=route con route_id válido.",
  ].join("\n");
}

function buildUserPrompt({ message, routes, menuId, servicesId, handoffId }) {
  return JSON.stringify(
    {
      message,
      menu_id: menuId,
      services_id: servicesId,
      handoff_id: handoffId,
      routes,
    },
    null,
    2
  );
}

function safeJsonParse(raw) {
  if (!raw || typeof raw !== "string") {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

async function routeWithAI({ text, flow, config, session }) {
  const aiConfig = config?.ai || {};
  const aiFlow = flow.ai || {};

  if (!aiFlow.enabled) {
    return null;
  }

  const provider = aiConfig.provider || aiFlow.provider || "openai";
  const apiKey =
    aiConfig.key ||
    aiConfig.api_key ||
    (provider === "gemini"
      ? process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
      : process.env.OPENAI_API_KEY);
  if (!apiKey) {
    return null;
  }

  const maxTurns = Number(aiFlow.max_turns || 2);
  const usedTurns = Number(session?.data?.ai_turns || 0);
  if (usedTurns >= maxTurns) {
    return { action: "menu", ai_used: false };
  }

  const routes = buildRouteCandidates(flow);
  if (!routes.length) {
    return { action: "menu" };
  }

  const menuId = flow.start_node_id || flow.start || "MAIN_MENU";
  const servicesId = aiFlow.services_node_id || "SERVICIOS_MENU";
  const handoffId = aiFlow.handoff_node_id || "AI_HANDOFF_OFFER";

  const system = buildSystemPrompt();
  const user = buildUserPrompt({
    message: text,
    routes,
    menuId,
    servicesId,
    handoffId,
  });

  const model = aiConfig.model || DEFAULT_MODELS[provider] || "gpt-4o-mini";

  try {
    const raw = await callAiProvider(provider, {
      apiKey,
      model,
      system,
      user,
      schema: ROUTER_SCHEMA,
      temperature: 0.1,
      maxTokens: 200,
    });
    const parsed = safeJsonParse(raw);
    if (!parsed?.action) {
      return null;
    }
    return { ...parsed, ai_used: true };
  } catch (error) {
    logger.error("ai.router_failed", {
      message: error.message,
      provider,
    });
    return null;
  }
}

module.exports = {
  routeWithAI,
  buildRouteCandidates,
};
