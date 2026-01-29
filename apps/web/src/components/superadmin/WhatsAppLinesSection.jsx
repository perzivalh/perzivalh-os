import React, { useState } from "react";
import { PlusIcon, SmartphoneIcon, EditIcon, TrashIcon } from "./icons";
import { WhatsAppLineModal } from "./WhatsAppLineModal";

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
        const url = editingLine
            ? `/api/superadmin/channels/${editingLine.id}`
            : `/api/superadmin/channels`;
        const method = editingLine ? "PATCH" : "POST";

        const res = await fetch(url, {
            method,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: JSON.stringify(data),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Error al guardar");
        }

        await onRefresh();
    };

    const handleDelete = async (lineId) => {
        if (!confirm("¿Estás seguro de que deseas eliminar esta línea? Esta acción no se puede deshacer.")) {
            return;
        }

        try {
            const res = await fetch(`/api/superadmin/channels/${lineId}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            });

            if (!res.ok) throw new Error("Error al eliminar");
            await onRefresh();
        } catch (error) {
            console.error("Error deleting channel:", error);
            alert("No se pudo eliminar la línea.");
        }
    };

    return (
        <div className="sa-lines-section">
            <div className="sa-lines-header">
                <div className="sa-lines-title">
                    <div className="sa-lines-icon">
                        <SmartphoneIcon width={24} height={24} />
                    </div>
                    <div>
                        <h3 className="sa-title" style={{ fontSize: "1.2rem", marginTop: 0 }}>LÍNEAS DE WHATSAPP CLOUD</h3>
                        <p className="sa-subtitle" style={{ fontSize: "0.8rem", margin: 0 }}>Gestiona las conexiones activas de WhatsApp</p>
                    </div>
                </div>
                <button className="sa-btn primary" onClick={handleAdd}>
                    <PlusIcon width={16} height={16} style={{ marginRight: "0.5rem" }} />
                    Agregar Nueva Línea
                </button>
            </div>

            <div className="sa-lines-grid">
                {channels.map((line) => (
                    <div key={line.id} className={`sa-line-card ${!line.is_active ? 'opacity-75' : ''}`}>
                        <div className="sa-line-header">
                            <div className="sa-line-name">
                                {line.display_name || "Sin nombre"}
                            </div>
                            <div className={`sa-line-status ${line.is_active ? "active" : ""}`} title={line.is_active ? "Activo" : "Inactivo"} />
                        </div>

                        <div className="sa-line-badges">
                            {line.is_default && <span className="sa-line-badge default">DEFAULT</span>}
                            {!line.is_active && <span className="sa-status warn">INACTIVO</span>}
                        </div>

                        <div className="sa-line-details">
                            <div className="sa-line-detail">
                                <span className="sa-detail-label">Phone ID</span>
                                <span className="sa-detail-value">{line.phone_number_id}</span>
                            </div>
                            <div className="sa-line-detail">
                                <span className="sa-detail-label">WABA ID</span>
                                <span className="sa-detail-value">{line.waba_id || "-"}</span>
                            </div>
                            <div className="sa-line-detail">
                                <span className="sa-detail-label">Token Verificación</span>
                                <span className="sa-detail-value">{line.verify_token.substring(0, 15)}...</span>
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

                <div className="sa-line-add-card" onClick={handleAdd}>
                    <div className="sa-add-icon-circle">
                        <PlusIcon width={24} height={24} />
                    </div>
                    <span style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>Nueva Conexión</span>
                </div>
            </div>

            <WhatsAppLineModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                initialData={editingLine}
                onSave={handleSave}
                tenantId={tenantId}
            />
        </div>
    );
}
