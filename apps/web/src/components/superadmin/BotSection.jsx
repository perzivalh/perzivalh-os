import React from "react";

/**
 * BotSection - Gestión de Bots para un Tenant
 * Replica el mockup de "Gestión de Bots"
 */
function BotSection({
    tenantId,
    tenantBots = [],
    availableFlows = [],
    loading = false,
    onToggleBot,
    onAddBot,
    onRemoveBot,
}) {
    // Calcular métricas (por ahora placeholders)
    const activeBotsCount = tenantBots.filter((b) => b.is_active).length;
    const totalBots = tenantBots.length;

    // Flows no asignados todavía
    const assignedFlowIds = tenantBots.map((b) => b.flow_id);
    const unassignedFlows = availableFlows.filter(
        (f) => !assignedFlowIds.includes(f.id)
    );

    const formatLastActivity = (date) => {
        if (!date) return "Sin actividad reciente";
        const d = new Date(date);
        const now = new Date();
        const diffMs = now - d;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return "Hace un momento";
        if (diffMins < 60) return `Última actividad: hace ${diffMins} minutos`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `Última actividad: hace ${diffHours}h`;
        return `Última actividad: ${d.toLocaleDateString()}`;
    };

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
                    <div className={`bot-toggle-pill ${activeBotsCount > 0 ? "active" : "inactive"}`}>
                        <span className="bot-toggle-dot" />
                        <span>{activeBotsCount > 0 ? "ACTIVO" : "INACTIVO"}</span>
                    </div>
                </div>
            </div>

            <div className="bot-section-content">
                {/* Panel izquierdo: Monitoreo de Flujos */}
                <div className="bot-flows-panel">
                    <div className="bot-panel-header">
                        <span className="bot-panel-title">MONITOREO DE FLUJOS</span>
                        {unassignedFlows.length > 0 && (
                            <button
                                type="button"
                                className="bot-add-btn"
                                onClick={() => onAddBot && onAddBot(unassignedFlows[0].id)}
                                title="Agregar bot"
                            >
                                +
                            </button>
                        )}
                    </div>

                    {loading ? (
                        <div className="bot-loading">Cargando...</div>
                    ) : tenantBots.length === 0 ? (
                        <div className="bot-empty">
                            <p>No hay bots asignados.</p>
                            {unassignedFlows.length > 0 && (
                                <button
                                    type="button"
                                    className="bot-add-flow-btn"
                                    onClick={() => onAddBot && onAddBot(unassignedFlows[0].id)}
                                >
                                    Agregar primer bot
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="bot-flows-list">
                            {tenantBots.map((bot) => (
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
                                                onChange={() => onToggleBot && onToggleBot(bot.id, !bot.is_active)}
                                            />
                                            <span className="bot-toggle-slider" />
                                        </label>
                                    </div>
                                    <div className="bot-flow-meta">
                                        {formatLastActivity(bot.updated_at)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Modal/Selector para agregar más bots */}
                    {unassignedFlows.length > 0 && tenantBots.length > 0 && (
                        <div className="bot-add-more">
                            <select
                                className="bot-add-select"
                                defaultValue=""
                                onChange={(e) => {
                                    if (e.target.value && onAddBot) {
                                        onAddBot(e.target.value);
                                        e.target.value = "";
                                    }
                                }}
                            >
                                <option value="" disabled>
                                    + Agregar otro bot...
                                </option>
                                {unassignedFlows.map((flow) => (
                                    <option key={flow.id} value={flow.id}>
                                        {flow.icon} {flow.name}
                                    </option>
                                ))}
                            </select>
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
                            <div className="bot-metric-badge positive">+12% vs ayer</div>
                            <div className="bot-metric-label">INTERACCIONES</div>
                            <div className="bot-metric-value">--</div>
                            <div className="bot-metric-sub">Total de sesiones iniciadas hoy</div>
                        </div>

                        {/* Resolución Final */}
                        <div className="bot-metric-card">
                            <div className="bot-metric-icon">✓</div>
                            <div className="bot-metric-badge neutral">Objetivo: 85%</div>
                            <div className="bot-metric-label">RESOLUCIÓN FINAL</div>
                            <div className="bot-metric-value">--%</div>
                            <div className="bot-metric-progress">
                                <div className="bot-metric-progress-fill" style={{ width: "0%" }} />
                            </div>
                        </div>

                        {/* Vida del Proceso */}
                        <div className="bot-metric-card">
                            <div className="bot-metric-icon">⏱</div>
                            <div className="bot-metric-badge sla">● SLA Normal</div>
                            <div className="bot-metric-label">VIDA DEL PROCESO</div>
                            <div className="bot-metric-value">--</div>
                            <div className="bot-metric-sub">UPTIME: --%</div>
                        </div>

                        {/* Errores */}
                        <div className="bot-metric-card">
                            <div className="bot-metric-icon error">⚠</div>
                            <div className="bot-metric-badge stable">Estable</div>
                            <div className="bot-metric-label">ERRORES</div>
                            <div className="bot-metric-value">--</div>
                            <div className="bot-metric-sub error-sub">CRÍTICOS: 0</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default BotSection;
