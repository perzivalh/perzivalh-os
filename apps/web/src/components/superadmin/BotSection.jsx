/**
 * BotSection (Super Admin)
 * Solo permite asignar o quitar bots a un tenant.
 * La gestión fina (activo/inactivo, métricas) la hace el cliente.
 */
import React, { useState } from "react";

function BotSection({
    tenantId,
    tenantBots,
    availableFlows,
    loading,
    onAddBot,
    onRemoveBot,
}) {
    const [selectedFlow, setSelectedFlow] = useState("");

    const usedFlowIds = new Set(tenantBots.map((tb) => tb.flow_id));
    const unusedFlows = availableFlows.filter((f) => !usedFlowIds.has(f.id));

    function handleAdd() {
        if (!selectedFlow) return;
        onAddBot(selectedFlow);
        setSelectedFlow("");
    }

    return (
        <div className="sa-card">
            <div className="sa-card-header">
                <h3>Asignación de Bots</h3>
                <p>Selecciona qué flujos estarán disponibles para este cliente.</p>
            </div>

            <div className="sa-bot-assign-list">
                {loading ? (
                    <div className="sa-loading">Cargando asignaciones...</div>
                ) : tenantBots.length === 0 ? (
                    <div className="sa-empty-state">Este cliente no tiene bots asignados.</div>
                ) : (
                    <div className="sa-assigned-bots">
                        {tenantBots.map((bot) => (
                            <div key={bot.id} className="sa-assigned-item">
                                <div className="sa-bot-info">
                                    <span className="sa-bot-icon">{bot.flow_icon || "🤖"}</span>
                                    <div className="sa-bot-details">
                                        <span className="sa-bot-name">{bot.flow_name || bot.flow_id}</span>
                                        <span className="sa-bot-desc">{bot.flow_description}</span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="sa-btn-icon danger"
                                    title="Quitar bot del cliente"
                                    onClick={() => onRemoveBot(bot.id)}
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="sa-bot-add-area">
                <select
                    className="sa-input"
                    value={selectedFlow}
                    onChange={(e) => setSelectedFlow(e.target.value)}
                    disabled={unusedFlows.length === 0}
                >
                    <option value="">-- Seleccionar bot para asignar --</option>
                    {unusedFlows.map((flow) => (
                        <option key={flow.id} value={flow.id}>
                            {flow.icon} {flow.name}
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    className="sa-btn primary small"
                    onClick={handleAdd}
                    disabled={!selectedFlow}
                >
                    Asignar
                </button>
            </div>
        </div>
    );
}

export default BotSection;
