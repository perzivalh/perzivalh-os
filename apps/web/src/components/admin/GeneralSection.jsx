/**
 * GeneralSection - Gestion de lineas de WhatsApp
 */
import React, { useMemo, useState } from "react";

const INITIAL_CHANNEL_FORM = {
    id: "",
    display_name: "",
    is_default: false,
    is_active: true,
};

function formatShortDate(value) {
    if (!value) {
        return "Sin fecha";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "Sin fecha";
    }
    return date.toLocaleDateString("es-BO", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function getLineName(channel) {
    if (channel?.display_name) {
        return channel.display_name;
    }
    const suffix = channel?.phone_number_id
        ? String(channel.phone_number_id).slice(-4)
        : "----";
    return `Linea ${suffix}`;
}

function GeneralSection({
    tenantChannels = [],
    channelForm = INITIAL_CHANNEL_FORM,
    setChannelForm,
    handleChannelSelect,
    handleChannelSubmit,
    handleChannelQuickUpdate,
}) {
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [copiedPhoneId, setCopiedPhoneId] = useState("");

    const selectedChannel = useMemo(
        () => tenantChannels.find((channel) => channel.id === channelForm.id) || null,
        [tenantChannels, channelForm.id]
    );

    const stats = useMemo(() => {
        const total = tenantChannels.length;
        const active = tenantChannels.filter((channel) => channel.is_active).length;
        const primary = tenantChannels.find((channel) => channel.is_default);
        return {
            total,
            active,
            inactive: total - active,
            primaryName: primary ? getLineName(primary) : "Sin principal",
        };
    }, [tenantChannels]);

    const filteredChannels = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();
        return [...tenantChannels]
            .filter((channel) => {
                if (statusFilter === "active" && !channel.is_active) {
                    return false;
                }
                if (statusFilter === "inactive" && channel.is_active) {
                    return false;
                }
                if (!normalizedSearch) {
                    return true;
                }
                const haystack = [
                    channel.display_name || "",
                    channel.phone_number_id || "",
                    channel.waba_id || "",
                ]
                    .join(" ")
                    .toLowerCase();
                return haystack.includes(normalizedSearch);
            })
            .sort((a, b) => {
                const byDefault = Number(Boolean(b.is_default)) - Number(Boolean(a.is_default));
                if (byDefault !== 0) {
                    return byDefault;
                }
                const byActive = Number(Boolean(b.is_active)) - Number(Boolean(a.is_active));
                if (byActive !== 0) {
                    return byActive;
                }
                return getLineName(a).localeCompare(getLineName(b), "es");
            });
    }, [tenantChannels, searchTerm, statusFilter]);

    async function handleCopyPhoneId(phoneNumberId) {
        if (!phoneNumberId) {
            return;
        }
        const value = String(phoneNumberId);
        try {
            if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
            } else if (typeof document !== "undefined") {
                const textarea = document.createElement("textarea");
                textarea.value = value;
                textarea.setAttribute("readonly", "");
                textarea.style.position = "absolute";
                textarea.style.left = "-9999px";
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                document.body.removeChild(textarea);
            }
            setCopiedPhoneId(value);
            setTimeout(() => {
                setCopiedPhoneId((prev) => (prev === value ? "" : prev));
            }, 1600);
        } catch (_error) {
            setCopiedPhoneId("");
        }
    }

    function resetChannelForm() {
        setChannelForm(INITIAL_CHANNEL_FORM);
    }

    return (
        <section className="general-lines-shell">
            <div className="general-lines-header">
                <div>
                    <h2 className="general-lines-title">Lineas de WhatsApp</h2>
                    <p className="general-lines-description">
                        Gestiona nombres visibles, estado operativo y linea principal para tus conversaciones.
                    </p>
                </div>
                <div className="general-lines-stats">
                    <div className="line-stat">
                        <span>Total</span>
                        <strong>{stats.total}</strong>
                    </div>
                    <div className="line-stat">
                        <span>Activas</span>
                        <strong>{stats.active}</strong>
                    </div>
                    <div className="line-stat">
                        <span>Inactivas</span>
                        <strong>{stats.inactive}</strong>
                    </div>
                    <div className="line-stat line-stat-wide">
                        <span>Principal</span>
                        <strong>{stats.primaryName}</strong>
                    </div>
                </div>
            </div>

            <div className="page-grid general-lines-grid">
                <div className="panel general-lines-panel">
                    <div className="panel-title">Listado de lineas</div>
                    <div className="general-lines-filters">
                        <label className="field">
                            <span>Buscar linea</span>
                            <input
                                type="text"
                                placeholder="Nombre, Phone ID o WABA ID"
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                            />
                        </label>
                        <label className="field">
                            <span>Estado</span>
                            <select
                                value={statusFilter}
                                onChange={(event) => setStatusFilter(event.target.value)}
                            >
                                <option value="all">Todas</option>
                                <option value="active">Activas</option>
                                <option value="inactive">Inactivas</option>
                            </select>
                        </label>
                    </div>

                    <div className="table">
                        <div className="table-head general-lines-table-head">
                            <span>Linea</span>
                            <span>Phone ID</span>
                            <span>Estado</span>
                            <span>Acciones</span>
                        </div>
                        {filteredChannels.map((channel) => (
                            <div className="table-row general-lines-row" key={channel.id}>
                                <div className="line-cell">
                                    <div className="line-main-name">{getLineName(channel)}</div>
                                    <div className="line-meta">
                                        {channel.is_default ? (
                                            <span className="line-pill default">Principal</span>
                                        ) : null}
                                        {channel.waba_id ? (
                                            <span className="line-pill">WABA {channel.waba_id}</span>
                                        ) : null}
                                        <span className="line-pill">Creada {formatShortDate(channel.created_at)}</span>
                                    </div>
                                </div>
                                <span className="line-phone-id">{channel.phone_number_id}</span>
                                <span>
                                    <span className={`line-pill ${channel.is_active ? "active" : "inactive"}`}>
                                        {channel.is_active ? "Activa" : "Inactiva"}
                                    </span>
                                </span>
                                <div className="row-actions">
                                    <button className="ghost" onClick={() => handleChannelSelect(channel)}>
                                        Editar
                                    </button>
                                    <button
                                        className="ghost"
                                        onClick={() => handleCopyPhoneId(channel.phone_number_id)}
                                    >
                                        {copiedPhoneId === channel.phone_number_id ? "Copiado" : "Copiar ID"}
                                    </button>
                                    <button
                                        className="ghost"
                                        onClick={() =>
                                            handleChannelQuickUpdate(channel.id, { is_default: true })
                                        }
                                        disabled={channel.is_default}
                                    >
                                        Principal
                                    </button>
                                    <button
                                        className={channel.is_active ? "danger soft" : "ghost"}
                                        onClick={() =>
                                            handleChannelQuickUpdate(channel.id, {
                                                is_active: !channel.is_active,
                                            })
                                        }
                                    >
                                        {channel.is_active ? "Desactivar" : "Activar"}
                                    </button>
                                </div>
                            </div>
                        ))}
                        {!filteredChannels.length && (
                            <div className="empty-state">No hay lineas que coincidan con los filtros.</div>
                        )}
                    </div>
                </div>

                <div className="panel general-lines-panel">
                    <div className="panel-title">
                        {channelForm.id ? "Editar linea seleccionada" : "Selecciona una linea"}
                    </div>
                    <form className="form-grid" onSubmit={handleChannelSubmit}>
                        <label className="field">
                            <span>Nombre visible</span>
                            <input
                                type="text"
                                value={channelForm.display_name || ""}
                                onChange={(event) =>
                                    setChannelForm((prev) => ({
                                        ...prev,
                                        display_name: event.target.value,
                                    }))
                                }
                                placeholder="Ej: Linea principal"
                                disabled={!channelForm.id}
                            />
                        </label>
                        <label className="field">
                            <span>Phone ID</span>
                            <input
                                type="text"
                                value={selectedChannel?.phone_number_id || ""}
                                readOnly
                                disabled
                            />
                        </label>
                        <label className="toggle">
                            <input
                                type="checkbox"
                                checked={Boolean(channelForm.is_default)}
                                onChange={(event) =>
                                    setChannelForm((prev) => ({
                                        ...prev,
                                        is_default: event.target.checked,
                                    }))
                                }
                                disabled={!channelForm.id}
                            />
                            Marcar como principal
                        </label>
                        <label className="toggle">
                            <input
                                type="checkbox"
                                checked={Boolean(channelForm.is_active)}
                                onChange={(event) =>
                                    setChannelForm((prev) => ({
                                        ...prev,
                                        is_active: event.target.checked,
                                    }))
                                }
                                disabled={!channelForm.id}
                            />
                            Linea activa
                        </label>
                        <div className="form-actions">
                            <button className="primary" type="submit" disabled={!channelForm.id}>
                                Guardar cambios
                            </button>
                            <button
                                className="ghost"
                                type="button"
                                disabled={!channelForm.id}
                                onClick={resetChannelForm}
                            >
                                Cancelar
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </section>
    );
}

export default GeneralSection;
