import React, { useEffect, useState } from "react";
import { apiGet, apiPatch } from "../../api";

const DEFAULT_AI_QUOTA = {
    enabled: true,
    tracked_providers: ["cerebras"],
    tenant_daily_token_limit: 1000000,
    chat_daily_token_limit: 10000,
    output_weight: 0.35,
};

const DEFAULT_AI_USAGE = {
    tenant: {
        used_tokens: 0,
        limit_tokens: 1000000,
        remaining_tokens: 1000000,
    },
    chats: [],
};

function BotSection() {
    const [bots, setBots] = useState([]);
    const [metrics, setMetrics] = useState(null);
    const [aiQuota, setAiQuota] = useState(DEFAULT_AI_QUOTA);
    const [aiUsage, setAiUsage] = useState(DEFAULT_AI_USAGE);
    const [quotaDay, setQuotaDay] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [updatingBotId, setUpdatingBotId] = useState("");
    const [savingQuota, setSavingQuota] = useState(false);

    useEffect(() => {
        void loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            const [botsRes, metricsRes, quotaRes] = await Promise.all([
                apiGet("/api/admin/bots"),
                apiGet("/api/admin/bots/metrics"),
                apiGet("/api/admin/bots/ai-quota"),
            ]);
            setBots(botsRes.bots || []);
            setMetrics(metricsRes.metrics || null);
            setAiQuota(quotaRes.config || DEFAULT_AI_QUOTA);
            setAiUsage(quotaRes.usage || DEFAULT_AI_USAGE);
            setQuotaDay(quotaRes.day || "");
            setError("");
        } catch (err) {
            console.error(err);
            setError(err.message || "Error al cargar datos");
        } finally {
            setLoading(false);
        }
    }

    async function handleToggleBot(botId, newActive) {
        if (updatingBotId) {
            return;
        }
        setUpdatingBotId(botId);
        setError("");
        try {
            await apiPatch(`/api/admin/bots/${botId}`, { is_active: newActive });
            setBots((prev) => {
                if (newActive) {
                    return prev.map((bot) => ({ ...bot, is_active: bot.id === botId }));
                }
                return prev.map((bot) =>
                    bot.id === botId ? { ...bot, is_active: false } : bot
                );
            });
        } catch (err) {
            setError(err.message || "Error al cambiar estado");
            await loadData();
        } finally {
            setUpdatingBotId("");
        }
    }

    async function handleSaveQuota() {
        if (savingQuota) {
            return;
        }
        setSavingQuota(true);
        setError("");
        try {
            const response = await apiPatch("/api/admin/bots/ai-quota", aiQuota);
            setAiQuota(response.config || aiQuota);
            setAiUsage(response.usage || DEFAULT_AI_USAGE);
            setQuotaDay(response.day || "");
        } catch (err) {
            setError(err.message || "Error al guardar cuota IA");
        } finally {
            setSavingQuota(false);
        }
    }

    function parseProviders(value) {
        return [...new Set(
            String(value || "")
                .split(/[,\s;]+/)
                .map((item) => item.trim().toLowerCase())
                .filter(Boolean)
        )];
    }

    function formatLastActivity(date) {
        if (!date) return "Sin actividad reciente";
        const d = new Date(date);
        const now = new Date();
        const diffMs = now - d;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return "Hace un momento";
        if (diffMins < 60) return `Ultima actividad: hace ${diffMins} min`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `Ultima actividad: hace ${diffHours}h`;
        return `Ultima actividad: ${d.toLocaleDateString()}`;
    }

    function formatTokenCount(value) {
        const num = Number(value || 0);
        return Number.isFinite(num) ? num.toLocaleString("es-BO") : "--";
    }

    const activeBotsCount = bots.filter((bot) => bot.is_active).length;
    const globalStatus = activeBotsCount > 0 ? "ACTIVO" : "INACTIVO";
    const globalClass = activeBotsCount > 0 ? "active" : "inactive";

    return (
        <div className="bot-section">
            <div className="bot-section-header">
                <div className="bot-section-title-area">
                    <div className="bot-section-icon">{"\uD83E\uDD16"}</div>
                    <div>
                        <h2 className="bot-section-title">Gestion de Bots</h2>
                        <p className="bot-section-subtitle">
                            Administra los flujos automatizados, metricas y la politica de IA.
                        </p>
                    </div>
                </div>
                <div className="bot-section-global-toggle">
                    <span className="bot-toggle-label">ESTADO DEL BOT:</span>
                    <div className={`bot-toggle-pill ${globalClass}`}>
                        <span className="bot-toggle-dot" />
                        <span>{globalStatus}</span>
                    </div>
                </div>
            </div>

            {error ? <div className="bot-error">{error}</div> : null}

            <div className="bot-section-content">
                <div className="bot-flows-panel">
                    <div className="bot-panel-header">
                        <span className="bot-panel-title">MONITOREO DE FLUJOS</span>
                    </div>

                    {loading ? (
                        <div className="bot-loading">Cargando bots...</div>
                    ) : bots.length === 0 ? (
                        <div className="bot-empty">
                            <p>No hay bots asignados a tu cuenta.</p>
                            <p className="bot-empty-hint">Contacta con soporte si necesitas activar un bot.</p>
                        </div>
                    ) : (
                        <div className="bot-flows-list">
                            {bots.map((bot) => (
                                <div key={bot.id} className="bot-flow-card">
                                    <div className="bot-flow-info">
                                        <span className="bot-flow-icon">{bot.flow_icon || "\uD83E\uDD16"}</span>
                                        <div>
                                            <div className="bot-flow-name">{bot.flow_name}</div>
                                            <div className={`bot-flow-status ${bot.is_active ? "active" : "inactive"}`}>
                                                {"\u25CF"} {bot.is_active ? "ACTIVO" : "INACTIVO"}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bot-flow-actions">
                                        <label className="bot-toggle-switch">
                                            <input
                                                type="checkbox"
                                                checked={bot.is_active}
                                                disabled={Boolean(updatingBotId)}
                                                onChange={() => handleToggleBot(bot.id, !bot.is_active)}
                                            />
                                            <span className="bot-toggle-slider" />
                                        </label>
                                    </div>
                                    <div className="bot-flow-meta">{formatLastActivity(bot.updated_at)}</div>
                                    {bot.flow_description ? (
                                        <div className="bot-flow-desc">{bot.flow_description}</div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bot-metrics-panel">
                    <div className="bot-panel-header">
                        <span className="bot-panel-title">METRICAS Y POLITICA IA</span>
                    </div>

                    <div style={{ display: "grid", gap: "1rem", overflowY: "auto", paddingRight: "0.25rem" }}>
                        <div className="bot-metrics-grid">
                            <div className="bot-metric-card">
                                <div className="bot-metric-icon">{"\uD83D\uDCCA"}</div>
                                <div className={`bot-metric-badge ${metrics?.interactions?.change >= 0 ? "positive" : "neutral"}`}>
                                    {metrics?.interactions?.change > 0 ? "+" : ""}{metrics?.interactions?.change ?? 0}% {metrics?.interactions?.label || "nodata"}
                                </div>
                                <div className="bot-metric-label">INTERACCIONES</div>
                                <div className="bot-metric-value">{metrics ? metrics.interactions.value : "--"}</div>
                                <div className="bot-metric-sub">Sesiones iniciadas hoy</div>
                            </div>

                            <div className="bot-metric-card">
                                <div className="bot-metric-icon">{"\u2713"}</div>
                                <div className="bot-metric-badge neutral">Objetivo: {metrics?.resolution?.target ?? 85}%</div>
                                <div className="bot-metric-label">RESOLUCION FINAL</div>
                                <div className="bot-metric-value">{metrics ? metrics.resolution.value : "--"}%</div>
                                <div className="bot-metric-progress">
                                    <div
                                        className="bot-metric-progress-fill"
                                        style={{ width: `${metrics ? metrics.resolution.value : 0}%` }}
                                    />
                                </div>
                            </div>

                            <div className="bot-metric-card">
                                <div className="bot-metric-icon">{"\u23F1"}</div>
                                <div className="bot-metric-badge sla">{"\u25CF"} {metrics?.uptime?.status || "Unknown"}</div>
                                <div className="bot-metric-label">VIDA DEL PROCESO</div>
                                <div className="bot-metric-value">{metrics ? metrics.uptime.value : "--"}</div>
                                <div className="bot-metric-sub">Uptime sistema</div>
                            </div>

                            <div className="bot-metric-card">
                                <div className={`bot-metric-icon ${metrics?.errors?.value > 0 ? "error" : ""}`}>{"\u26A0"}</div>
                                <div className={`bot-metric-badge ${metrics?.errors?.value === 0 ? "stable" : "neutral"}`}>
                                    {metrics?.errors?.status || "Unknown"}
                                </div>
                                <div className="bot-metric-label">ERRORES</div>
                                <div className="bot-metric-value">{metrics ? metrics.errors.value : "--"}</div>
                                <div className={`bot-metric-sub ${metrics?.errors?.critical > 0 ? "error-sub" : ""}`}>
                                    Criticos: {metrics ? metrics.errors.critical : 0}
                                </div>
                            </div>
                        </div>

                        <div className="bot-metric-card" style={{ display: "grid", gap: "1rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                                <div style={{ display: "grid", gap: "0.35rem" }}>
                                    <div className="bot-metric-label">POLITICA IA Y CUOTA DIARIA</div>
                                    <div className="bot-metric-sub">
                                        La IA manda mientras haya presupuesto. Si un chat o el tenant agotan su cupo del dia,
                                        el bot pasa al modo economico por keywords.
                                    </div>
                                    {quotaDay ? <div className="bot-metric-sub">Corte diario: {quotaDay}</div> : null}
                                </div>
                                <div className={`bot-metric-badge ${aiQuota.enabled ? "positive" : "neutral"}`} style={{ position: "static" }}>
                                    {aiQuota.enabled ? "IA-FIRST" : "SOLO FALLBACK"}
                                </div>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.8rem" }}>
                                <label style={{ display: "grid", gap: "0.45rem" }}>
                                    <span className="bot-metric-label">MODO IA PREMIUM</span>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", minHeight: "42px", color: "var(--muted)" }}>
                                        <input
                                            type="checkbox"
                                            checked={Boolean(aiQuota.enabled)}
                                            onChange={(e) => setAiQuota((prev) => ({ ...prev, enabled: e.target.checked }))}
                                        />
                                        <span>Usar IA antes del fallback keyword</span>
                                    </div>
                                </label>

                                <label style={{ display: "grid", gap: "0.45rem" }}>
                                    <span className="bot-metric-label">PROVEEDORES CONTROLADOS</span>
                                    <input
                                        className="settings-input"
                                        value={Array.isArray(aiQuota.tracked_providers) ? aiQuota.tracked_providers.join(", ") : ""}
                                        onChange={(e) => setAiQuota((prev) => ({ ...prev, tracked_providers: parseProviders(e.target.value) }))}
                                        placeholder="cerebras"
                                    />
                                </label>

                                <label style={{ display: "grid", gap: "0.45rem" }}>
                                    <span className="bot-metric-label">LIMITE DIARIO TENANT</span>
                                    <input
                                        className="settings-input"
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={aiQuota.tenant_daily_token_limit ?? ""}
                                        onChange={(e) => setAiQuota((prev) => ({ ...prev, tenant_daily_token_limit: parseInt(e.target.value, 10) || 0 }))}
                                    />
                                </label>

                                <label style={{ display: "grid", gap: "0.45rem" }}>
                                    <span className="bot-metric-label">LIMITE DIARIO POR CHAT</span>
                                    <input
                                        className="settings-input"
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={aiQuota.chat_daily_token_limit ?? ""}
                                        onChange={(e) => setAiQuota((prev) => ({ ...prev, chat_daily_token_limit: parseInt(e.target.value, 10) || 0 }))}
                                    />
                                </label>

                                <label style={{ display: "grid", gap: "0.45rem" }}>
                                    <span className="bot-metric-label">PESO DE OUTPUT</span>
                                    <input
                                        className="settings-input"
                                        type="number"
                                        min="0"
                                        step="0.05"
                                        value={aiQuota.output_weight ?? 0.35}
                                        onChange={(e) => setAiQuota((prev) => ({ ...prev, output_weight: parseFloat(e.target.value) || 0 }))}
                                    />
                                </label>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
                                <div style={{ padding: "0.8rem", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--panel)" }}>
                                    <div className="bot-metric-label">USADO HOY (TENANT)</div>
                                    <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--ink)" }}>{formatTokenCount(aiUsage?.tenant?.used_tokens)}</div>
                                    <div className="bot-metric-sub">de {formatTokenCount(aiUsage?.tenant?.limit_tokens)} tokens</div>
                                </div>
                                <div style={{ padding: "0.8rem", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--panel)" }}>
                                    <div className="bot-metric-label">RESTANTE HOY</div>
                                    <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--ink)" }}>{formatTokenCount(aiUsage?.tenant?.remaining_tokens)}</div>
                                    <div className="bot-metric-sub">presupuesto disponible</div>
                                </div>
                                <div style={{ padding: "0.8rem", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--panel)" }}>
                                    <div className="bot-metric-label">CHATS VIGILADOS</div>
                                    <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--ink)" }}>{Array.isArray(aiUsage?.chats) ? aiUsage.chats.length : 0}</div>
                                    <div className="bot-metric-sub">top de consumo hoy</div>
                                </div>
                            </div>

                            <div style={{ display: "grid", gap: "0.55rem" }}>
                                <div className="bot-metric-label">TOP CHATS DEL DIA</div>
                                {Array.isArray(aiUsage?.chats) && aiUsage.chats.length > 0 ? (
                                    <div style={{ display: "grid", gap: "0.45rem" }}>
                                        {aiUsage.chats.map((chat) => (
                                            <div
                                                key={chat.wa_id}
                                                style={{
                                                    display: "grid",
                                                    gridTemplateColumns: "minmax(0, 1fr) auto auto",
                                                    gap: "0.75rem",
                                                    alignItems: "center",
                                                    padding: "0.65rem 0.75rem",
                                                    borderRadius: "10px",
                                                    border: "1px solid var(--border)",
                                                    background: "rgba(255,255,255,0.02)",
                                                }}
                                            >
                                                <span style={{ color: "var(--ink)", fontSize: "0.82rem" }}>{chat.wa_id_masked}</span>
                                                <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>{formatTokenCount(chat.used_tokens)} usados</span>
                                                <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>{formatTokenCount(chat.remaining_tokens)} restantes</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="bot-metric-sub">Todavia no hay consumo acumulado hoy.</div>
                                )}
                            </div>

                            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={handleSaveQuota}
                                    disabled={savingQuota}
                                >
                                    {savingQuota ? "Guardando..." : "Guardar politica IA"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default BotSection;
