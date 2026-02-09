/**
 * BotSection - Gestión de Bots para el Tenant
 * Versión simplificada y conectada a métricas reales
 */
import React, { useEffect, useState } from "react";
import { apiGet, apiPatch } from "../../api";

function BotSection() {
    const [bots, setBots] = useState([]);
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [updatingBotId, setUpdatingBotId] = useState("");

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            const [botsRes, metricsRes] = await Promise.all([
                apiGet("/api/admin/bots"),
                apiGet("/api/admin/bots/metrics")
            ]);
            setBots(botsRes.bots || []);
            setMetrics(metricsRes.metrics);
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
                    // Solo un bot puede quedar activo al mismo tiempo.
                    return prev.map((b) => ({ ...b, is_active: b.id === botId }));
                }
                return prev.map((b) =>
                    b.id === botId ? { ...b, is_active: false } : b
                );
            });
        } catch (err) {
            setError(err.message || "Error al cambiar estado");
            await loadData();
        } finally {
            setUpdatingBotId("");
        }
    }

    const formatLastActivity = (date) => {
        if (!date) return "Sin actividad reciente";
        const d = new Date(date);
        const now = new Date();
        const diffMs = now - d;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return "Hace un momento";
        if (diffMins < 60) return `Última actividad: hace ${diffMins} min`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `Última actividad: hace ${diffHours}h`;
        return `Última actividad: ${d.toLocaleDateString()}`;
    };

    // Calcular estado global para el header
    const activeBotsCount = bots.filter(b => b.is_active).length;
    const globalStatus = activeBotsCount > 0 ? "ACTIVO" : "INACTIVO";
    const globalClass = activeBotsCount > 0 ? "active" : "inactive";

    return (
        <div className="bot-section">
            {/* Header */}
            <div className="bot-section-header">
                <div className="bot-section-title-area">
                    <div className="bot-section-icon">🤖</div>
                    <div>
                        <h2 className="bot-section-title">Gestión de Bots</h2>
                        <p className="bot-section-subtitle">
                            Administra los flujos automatizados y el rendimiento técnico.
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

            {error && <div className="bot-error">{error}</div>}

            <div className="bot-section-content">
                {/* Panel izquierdo: Monitoreo de Flujos */}
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
                                        <span className="bot-flow-icon">{bot.flow_icon || "🤖"}</span>
                                        <div>
                                            <div className="bot-flow-name">{bot.flow_name}</div>
                                            <div className={`bot-flow-status ${bot.is_active ? "active" : "inactive"}`}>
                                                ● {bot.is_active ? "ACTIVO" : "INACTIVO"}
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
                                    <div className="bot-flow-meta">
                                        {formatLastActivity(bot.updated_at)}
                                    </div>
                                    {bot.flow_description && (
                                        <div className="bot-flow-desc">{bot.flow_description}</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Panel derecho: Métricas */}
                <div className="bot-metrics-panel">
                    <div className="bot-panel-header">
                        <span className="bot-panel-title">MÉTRICAS DE EFICACIA DETALLADAS</span>
                    </div>

                    <div className="bot-metrics-grid">
                        {/* Interacciones */}
                        <div className="bot-metric-card">
                            <div className="bot-metric-icon">📊</div>
                            <div className={`bot-metric-badge ${metrics?.interactions?.change >= 0 ? "positive" : "neutral"}`}>
                                {metrics?.interactions?.change > 0 ? "+" : ""}{metrics?.interactions?.change}% {metrics?.interactions?.label}
                            </div>
                            <div className="bot-metric-label">INTERACCIONES</div>
                            <div className="bot-metric-value">{metrics ? metrics.interactions.value : "--"}</div>
                            <div className="bot-metric-sub">Total de sesiones iniciadas hoy</div>
                        </div>

                        {/* Resolución Final */}
                        <div className="bot-metric-card">
                            <div className="bot-metric-icon">✓</div>
                            <div className="bot-metric-badge neutral">Objetivo: {metrics?.resolution?.target}%</div>
                            <div className="bot-metric-label">RESOLUCIÓN FINAL</div>
                            <div className="bot-metric-value">{metrics ? metrics.resolution.value : "--"}%</div>
                            <div className="bot-metric-progress">
                                <div
                                    className="bot-metric-progress-fill"
                                    style={{ width: `${metrics ? metrics.resolution.value : 0}%` }}
                                />
                            </div>
                        </div>

                        {/* Vida del Proceso */}
                        <div className="bot-metric-card">
                            <div className="bot-metric-icon">⏱</div>
                            <div className="bot-metric-badge sla">● {metrics?.uptime?.status}</div>
                            <div className="bot-metric-label">VIDA DEL PROCESO</div>
                            <div className="bot-metric-value">{metrics ? metrics.uptime.value : "--"}</div>
                            <div className="bot-metric-sub">UPTIME SISTEMA</div>
                        </div>

                        {/* Errores */}
                        <div className="bot-metric-card">
                            <div className={`bot-metric-icon ${metrics?.errors?.value > 0 ? "error" : ""}`}>⚠</div>
                            <div className={`bot-metric-badge ${metrics?.errors?.value === 0 ? "stable" : "neutral"}`}>
                                {metrics?.errors?.status}
                            </div>
                            <div className="bot-metric-label">ERRORES</div>
                            <div className="bot-metric-value">{metrics ? metrics.errors.value : "--"}</div>
                            <div className={`bot-metric-sub ${metrics?.errors?.critical > 0 ? "error-sub" : ""}`}>
                                CRÍTICOS: {metrics ? metrics.errors.critical : 0}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default BotSection;
