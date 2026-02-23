/**
 * BotSection (Super Admin)
 * Solo permite asignar o quitar bots a un tenant.
 */
import React, { useMemo, useState } from "react";

const CLOUDFLARE_DEFAULT_MODEL = "@cf/meta/llama-3-8b-instruct";

function isCloudflareProvider(value) {
  const provider = String(value || "").toLowerCase();
  return (
    provider === "cloudflare" ||
    provider === "cloudflare-workers-ai" ||
    provider === "workers-ai"
  );
}

function BotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="5" y="7" width="14" height="10" rx="2" strokeWidth="1.8" />
      <circle cx="9" cy="12" r="1" strokeWidth="1.8" />
      <circle cx="15" cy="12" r="1" strokeWidth="1.8" />
      <line x1="12" y1="4" x2="12" y2="7" strokeWidth="1.8" />
    </svg>
  );
}

function BotSection({
  tenantId,
  tenantBots,
  availableFlows,
  loading,
  onAddBot,
  onRemoveBot,
  onUpdateBotConfig,
}) {
  const [selectedFlow, setSelectedFlow] = useState("");
  const [selectedAiProvider, setSelectedAiProvider] = useState("openai");
  const [selectedAiKey, setSelectedAiKey] = useState("");
  const [selectedAiAccountId, setSelectedAiAccountId] = useState("");
  const [selectedAiModel, setSelectedAiModel] = useState(CLOUDFLARE_DEFAULT_MODEL);
  const [botDrafts, setBotDrafts] = useState({});

  const usedFlowIds = new Set(tenantBots.map((tb) => tb.flow_id));
  const unusedFlows = availableFlows.filter((flow) => !usedFlowIds.has(flow.id));
  const flowById = useMemo(() => {
    return new Map(availableFlows.map((flow) => [flow.id, flow]));
  }, [availableFlows]);
  const selectedFlowMeta = unusedFlows.find((flow) => flow.id === selectedFlow);
  const selectedRequiresAi = Boolean(selectedFlowMeta?.requires_ai);

  function handleAdd() {
    if (!selectedFlow) {
      return;
    }
    const config = selectedRequiresAi
      ? {
          ai: {
            provider: selectedAiProvider,
            key: selectedAiKey || undefined,
            ...(isCloudflareProvider(selectedAiProvider)
              ? {
                  account_id: selectedAiAccountId || undefined,
                  model: selectedAiModel || CLOUDFLARE_DEFAULT_MODEL,
                }
              : {}),
          },
        }
      : null;
    onAddBot(selectedFlow, config);
    setSelectedFlow("");
    setSelectedAiKey("");
  }

  function updateDraft(botId, updates) {
    setBotDrafts((prev) => ({
      ...prev,
      [botId]: { ...(prev[botId] || {}), ...updates },
    }));
  }

  function handleSaveConfig(bot) {
    if (!onUpdateBotConfig) {
      return;
    }
    const draft = botDrafts[bot.id] || {};
    const provider = draft.provider || bot.config?.ai?.provider || "openai";
    const keyValue = draft.key || "";
    const accountIdValue =
      draft.account_id ||
      draft.accountId ||
      bot.config?.ai?.account_id ||
      bot.config?.ai?.accountId ||
      "";
    const modelValue =
      draft.model ||
      bot.config?.ai?.model ||
      CLOUDFLARE_DEFAULT_MODEL;
    const config = {
      ai: {
        provider,
        ...(keyValue ? { key: keyValue } : {}),
        ...(isCloudflareProvider(provider)
          ? {
              ...(accountIdValue ? { account_id: accountIdValue } : {}),
              model: modelValue,
            }
          : {}),
      },
    };
    onUpdateBotConfig(bot.id, config);
    updateDraft(bot.id, { key: "" });
  }

  return (
    <section className="sa-bot-card" data-tenant={tenantId || ""}>
      <header className="sa-bot-header">
        <div className="sa-bot-icon-large" aria-hidden="true">
          <BotIcon />
        </div>
        <div className="sa-bot-title-group">
          <h3>Asignacion de Bots</h3>
          <p>
            Selecciona que flujos estaran disponibles para este cliente. Los
            flujos asignados apareceran inmediatamente en el panel del usuario.
          </p>
        </div>
      </header>

      <div className="sa-bot-body">
        {loading ? (
          <div className="sa-bot-loading">Cargando asignaciones...</div>
        ) : tenantBots.length === 0 ? (
          <div className="sa-bot-empty">
            <div className="sa-bot-empty-icon">+</div>
            <div className="sa-bot-empty-title">Sin bots asignados</div>
            <div className="sa-bot-empty-sub">
              Agrega un flujo desde el selector para activarlo en este tenant.
            </div>
          </div>
        ) : (
          <div className="sa-bot-grid">
            {tenantBots.map((bot) => (
              <div key={bot.id} className="sa-assigned-bot">
                <div className="sa-bot-item-icon">
                  {bot.flow_icon || ">"}
                </div>
                <div className="sa-bot-item-info">
                  <span className="sa-bot-item-name">
                    {bot.flow_name || bot.flow_id}
                  </span>
                  <span className="sa-bot-item-desc">
                    {bot.flow_description || "Sin descripcion"}
                  </span>
                  {flowById.get(bot.flow_id)?.requires_ai && (
                    <div className="sa-bot-ai-config">
                      <div className="sa-ai-field">
                        <label className="sa-select-label">Proveedor IA</label>
                        <select
                          className="sa-select-styled"
                          value={
                            botDrafts[bot.id]?.provider ||
                            bot.config?.ai?.provider ||
                            "openai"
                          }
                          onChange={(event) =>
                            updateDraft(bot.id, {
                              provider: event.target.value,
                              ...(isCloudflareProvider(event.target.value) &&
                              !(botDrafts[bot.id]?.model || bot.config?.ai?.model)
                                ? { model: CLOUDFLARE_DEFAULT_MODEL }
                                : {}),
                            })
                          }
                        >
                          <option value="openai">OpenAI</option>
                          <option value="gemini">Gemini</option>
                          <option value="cloudflare">Cloudflare Workers AI</option>
                        </select>
                      </div>
                      <div className="sa-ai-field">
                        <label className="sa-select-label">
                          {isCloudflareProvider(
                            botDrafts[bot.id]?.provider ||
                              bot.config?.ai?.provider ||
                              "openai"
                          )
                            ? "API Token"
                            : "API Key"}
                        </label>
                        <input
                          type="password"
                          className="sa-input"
                          placeholder={
                            bot.config?.ai?.key_present
                              ? "******** (configurada)"
                              : "Pegue la API key"
                          }
                          value={botDrafts[bot.id]?.key || ""}
                          onChange={(event) =>
                            updateDraft(bot.id, { key: event.target.value })
                          }
                        />
                      </div>
                      {isCloudflareProvider(
                        botDrafts[bot.id]?.provider ||
                          bot.config?.ai?.provider ||
                          "openai"
                      ) && (
                        <>
                          <div className="sa-ai-field">
                            <label className="sa-select-label">Account ID</label>
                            <input
                              type="text"
                              className="sa-input"
                              placeholder="2cf98d32..."
                              value={
                                botDrafts[bot.id]?.account_id ||
                                botDrafts[bot.id]?.accountId ||
                                bot.config?.ai?.account_id ||
                                bot.config?.ai?.accountId ||
                                ""
                              }
                              onChange={(event) =>
                                updateDraft(bot.id, {
                                  account_id: event.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="sa-ai-field">
                            <label className="sa-select-label">Modelo</label>
                            <input
                              type="text"
                              className="sa-input"
                              placeholder={CLOUDFLARE_DEFAULT_MODEL}
                              value={
                                botDrafts[bot.id]?.model ||
                                bot.config?.ai?.model ||
                                CLOUDFLARE_DEFAULT_MODEL
                              }
                              onChange={(event) =>
                                updateDraft(bot.id, { model: event.target.value })
                              }
                            />
                          </div>
                        </>
                      )}
                      <button
                        type="button"
                        className="sa-btn-assign sa-btn-save"
                        onClick={() => handleSaveConfig(bot)}
                      >
                        Guardar IA
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="sa-btn-remove"
                  title="Quitar bot del cliente"
                  onClick={() => onRemoveBot(bot.id)}
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="sa-bot-controls">
        <div className="sa-select-container">
          <label className="sa-select-label">Asignar bot</label>
          <select
            className="sa-select-styled"
            value={selectedFlow}
            onChange={(event) => setSelectedFlow(event.target.value)}
            disabled={unusedFlows.length === 0}
          >
            <option value="">
              {unusedFlows.length === 0
                ? "No hay mas bots disponibles"
                : "Selecciona un bot para asignar"}
            </option>
            {unusedFlows.map((flow) => (
              <option key={flow.id} value={flow.id}>
                {flow.name}
              </option>
            ))}
          </select>
        </div>
        {selectedRequiresAi && (
          <div className="sa-ai-assign">
            <div className="sa-ai-field">
              <label className="sa-select-label">Proveedor IA</label>
              <select
                className="sa-select-styled"
                value={selectedAiProvider}
              onChange={(event) => setSelectedAiProvider(event.target.value)}
            >
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="cloudflare">Cloudflare Workers AI</option>
            </select>
          </div>
          <div className="sa-ai-field">
            <label className="sa-select-label">
              {isCloudflareProvider(selectedAiProvider) ? "API Token" : "API Key"}
            </label>
            <input
              type="password"
              className="sa-input"
              placeholder={
                isCloudflareProvider(selectedAiProvider)
                  ? "Pegue el API token de Cloudflare"
                  : "Pegue la API key"
              }
              value={selectedAiKey}
              onChange={(event) => setSelectedAiKey(event.target.value)}
            />
          </div>
          {isCloudflareProvider(selectedAiProvider) && (
            <>
              <div className="sa-ai-field">
                <label className="sa-select-label">Account ID</label>
                <input
                  type="text"
                  className="sa-input"
                  placeholder="2cf98d32..."
                  value={selectedAiAccountId}
                  onChange={(event) => setSelectedAiAccountId(event.target.value)}
                />
              </div>
              <div className="sa-ai-field">
                <label className="sa-select-label">Modelo</label>
                <input
                  type="text"
                  className="sa-input"
                  placeholder={CLOUDFLARE_DEFAULT_MODEL}
                  value={selectedAiModel}
                  onChange={(event) => setSelectedAiModel(event.target.value)}
                />
              </div>
            </>
          )}
        </div>
        )}
        <button
          type="button"
          className="sa-btn-assign"
          onClick={handleAdd}
          disabled={!selectedFlow}
        >
          Asignar Bot
        </button>
      </div>
    </section>
  );
}

export default BotSection;
