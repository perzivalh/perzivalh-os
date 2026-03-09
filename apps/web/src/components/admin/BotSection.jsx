import React, { useEffect, useState } from "react";
import { apiGet, apiPatch } from "../../api";

function BotSection({ canManageBot = false }) {
    const [bots, setBots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [updatingBotId, setUpdatingBotId] = useState("");

    useEffect(() => {
        void loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            const botsRes = await apiGet("/api/admin/bots");
            setBots(botsRes.bots || []);
            setError("");
        } catch (err) {
            console.error(err);
            setError(err.message || "Error al cargar bots");
        } finally {
            setLoading(false);
        }
    }

    async function handleToggleBot(botId, newActive) {
        if (!canManageBot || updatingBotId) {
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

    function formatLastActivity(date) {
        if (!date) return "Sin actividad reciente";
        const d = new Date(date);
        const now = new Date();
        const diffMins = Math.floor((now - d) / 60000);
        if (diffMins < 1) return "Hace un momento";
        if (diffMins < 60) return `Ultima actividad: hace ${diffMins} min`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `Ultima actividad: hace ${diffHours}h`;
        return `Ultima actividad: ${d.toLocaleDateString()}`;
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
                            Administra los flujos automatizados del bot.
                        </p>
                        {!canManageBot ? (
                            <p className="bot-section-subtitle">Modo solo lectura para este rol.</p>
                        ) : null}
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
                                                disabled={!canManageBot || Boolean(updatingBotId)}
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
            </div>
        </div>
    );
}

export default BotSection;
