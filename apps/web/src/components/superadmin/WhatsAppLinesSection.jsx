import React, { useState } from "react";
import { PlusIcon, SmartphoneIcon, EditIcon, TrashIcon } from "./icons";
import { WhatsAppLineModal } from "./WhatsAppLineModal";
import { WhatsAppEmbeddedSignup } from "./WhatsAppEmbeddedSignup";
import { apiDelete, apiPatch, apiPost } from "../../api";

export function WhatsAppLinesSection({ channels = [], tenantId, onRefresh }) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingLine, setEditingLine] = useState(null);

    const handleAdd = () => {
        setEditingLine(null);
        setIsModalOpen(true);
    };

    const handleEdit = (line) => {
        setEditingLine(line);
        setIsModalOpen(true);
    };

    const handleSave = async (data) => {
        if (editingLine) {
            await apiPatch(`/api/superadmin/channels/${editingLine.id}`, data);
        } else {
            await apiPost("/api/superadmin/channels", data);
        }

        await onRefresh();
    };

    const handleDelete = async (lineId) => {
        if (!confirm("¿Estás seguro de que deseas eliminar esta línea? Esta acción no se puede deshacer.")) {
            return;
        }

        try {
            await apiDelete(`/api/superadmin/channels/${lineId}`);
            await onRefresh();
        } catch (error) {
            console.error("Error deleting channel:", error);
            alert("No se pudo eliminar la línea.");
        }
    };

    return (
        <section className="sa-lines-card">
            <header className="sa-lines-header">
                <div className="sa-lines-title">
                    <div className="sa-lines-icon">
                        <SmartphoneIcon width={24} height={24} />
                    </div>
                    <div>
                        <h3>Líneas de WhatsApp Cloud</h3>
                        <p>Gestiona las conexiones activas de WhatsApp para este tenant.</p>
                    </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                    <WhatsAppEmbeddedSignup
                        tenantId={tenantId}
                        onSuccess={() => {
                            alert("¡Línea conectada correctamente!");
                            onRefresh();
                        }}
                        onError={(msg) => alert(`Error: ${msg}`)}
                    />
                    <button className="sa-btn ghost" onClick={handleAdd}>
                        <PlusIcon width={16} height={16} style={{ marginRight: "0.5rem" }} />
                        Manual
                    </button>
                </div>
            </header>

            <div className="sa-lines-body">
                <div className="sa-lines-grid">
                    {channels.map((line) => (
                        <div key={line.id} className={`sa-line-card ${!line.is_active ? "opacity-75" : ""}`}>
                            <div className="sa-line-header">
                                <div>
                                    <div className="sa-line-name">{line.display_name || "Sin nombre"}</div>
                                    <div className="sa-line-meta">
                                        ID: {line.phone_number_id}
                                    </div>
                                </div>
                                <div className={`sa-line-status ${line.is_active ? "active" : ""}`} title={line.is_active ? "Activo" : "Inactivo"} />
                            </div>

                            <div className="sa-line-badges">
                                {line.is_default && <span className="sa-line-badge default">DEFAULT</span>}
                                {!line.is_active && <span className="sa-status warn">INACTIVO</span>}
                            </div>

                            <div className="sa-line-details">
                                <div className="sa-line-detail">
                                    <span className="sa-detail-label">WABA ID</span>
                                    <span className="sa-detail-value">{line.waba_id || "-"}</span>
                                </div>
                                <div className="sa-line-detail">
                                    <span className="sa-detail-label">Verify Token</span>
                                    <span className="sa-detail-value">
                                        {line.verify_token ? `${line.verify_token.substring(0, 16)}...` : "-"}
                                    </span>
                                </div>
                            </div>

                            <div className="sa-line-actions">
                                <button className="sa-btn ghost" onClick={() => handleEdit(line)} title="Editar">
                                    <EditIcon width={16} height={16} />
                                </button>
                                <button className="sa-btn ghost" onClick={() => handleDelete(line.id)} title="Eliminar" style={{ color: "#f87171" }}>
                                    <TrashIcon width={16} height={16} />
                                </button>
                            </div>
                        </div>
                    ))}

                    <button type="button" className="sa-line-add-card" onClick={handleAdd}>
                        <div className="sa-add-icon-circle">
                            <PlusIcon width={24} height={24} />
                        </div>
                        <span>Nueva Conexión Manual</span>
                    </button>
                </div>
            </div>

            <WhatsAppLineModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                initialData={editingLine}
                onSave={handleSave}
                tenantId={tenantId}
            />
        </section>
    );
}
