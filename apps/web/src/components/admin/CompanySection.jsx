/**
 * CompanySection - Configuracion de Empresa, Sucursales y Servicios
 * Datos que el bot usa para responder inteligentemente.
 */
import React, { useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost, apiDelete } from "../../api";

// ─── helpers ──────────────────────────────────────────────────────────────────

const EMPTY_COMPANY = {
    name: "",
    slogan: "",
    city: "",
    specialty: "",
    restrictions: [],
};

const EMPTY_BOT = {
    name: "",
    emoji: "",
    tone: "",
    language: "",
    max_sentences: 2,
    emojis: [],
};

const EMPTY_BRANCH = {
    code: "",
    name: "",
    address: "",
    lat: "",
    lng: "",
    hours_text: "",
    phone: "",
};

const EMPTY_SERVICE = {
    code: "",
    name: "",
    subtitle: "",
    description: "",
    keywords: "",
    price_bob: "",
    duration_min: "",
    is_featured: false,
};

function TagInput({ value = [], onChange, placeholder }) {
    const [input, setInput] = useState("");

    function addTag() {
        const tag = input.trim();
        if (tag && !value.includes(tag)) {
            onChange([...value, tag]);
        }
        setInput("");
    }

    function removeTag(tag) {
        onChange(value.filter((t) => t !== tag));
    }

    return (
        <div className="tag-input-wrap">
            <div className="tag-list">
                {value.map((tag) => (
                    <span key={tag} className="tag-chip">
                        {tag}
                        <button
                            type="button"
                            className="tag-chip-remove"
                            onClick={() => removeTag(tag)}
                            aria-label={`Eliminar ${tag}`}
                        >
                            ×
                        </button>
                    </span>
                ))}
            </div>
            <div className="tag-input-row">
                <input
                    type="text"
                    className="settings-input"
                    value={input}
                    placeholder={placeholder || "Agregar..."}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            addTag();
                        }
                    }}
                />
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={addTag}
                >
                    +
                </button>
            </div>
        </div>
    );
}

// ─── CompanySection ────────────────────────────────────────────────────────────

function CompanySection() {
    const [tab, setTab] = useState("identity");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // Identidad
    const [company, setCompany] = useState(EMPTY_COMPANY);
    const [botIdentity, setBotIdentity] = useState(EMPTY_BOT);

    // Sucursales
    const [branches, setBranches] = useState([]);
    const [branchModal, setBranchModal] = useState(null); // null | { mode: "create"|"edit", data }

    // Servicios
    const [services, setServices] = useState([]);
    const [serviceModal, setServiceModal] = useState(null);

    useEffect(() => {
        loadAll();
    }, []);

    async function loadAll() {
        setLoading(true);
        setError(null);
        try {
            const [profileRes, branchesRes, servicesRes] = await Promise.all([
                apiGet("/api/admin/company-profile"),
                apiGet("/api/admin/branches"),
                apiGet("/api/admin/services"),
            ]);
            setCompany(profileRes.company || EMPTY_COMPANY);
            setBotIdentity(profileRes.botIdentity || EMPTY_BOT);
            setBranches(branchesRes.branches || []);
            setServices(servicesRes.services || []);
        } catch (err) {
            setError("No se pudo cargar la informacion. " + err.message);
        } finally {
            setLoading(false);
        }
    }

    function showSuccess(msg) {
        setSuccess(msg);
        setTimeout(() => setSuccess(null), 3000);
    }

    // ── Identidad ──────────────────────────────────────────────────────────────

    async function handleSaveIdentity(e) {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            await apiPatch("/api/admin/company-profile", {
                company,
                botIdentity,
            });
            showSuccess("Identidad guardada. El bot usara estos datos en los proximos mensajes.");
        } catch (err) {
            setError("Error al guardar: " + err.message);
        } finally {
            setSaving(false);
        }
    }

    // ── Sucursales ─────────────────────────────────────────────────────────────

    function openCreateBranch() {
        setBranchModal({ mode: "create", data: { ...EMPTY_BRANCH } });
    }

    function openEditBranch(branch) {
        setBranchModal({
            mode: "edit",
            data: {
                id: branch.id,
                code: branch.code || "",
                name: branch.name || "",
                address: branch.address || "",
                lat: branch.lat != null ? String(branch.lat) : "",
                lng: branch.lng != null ? String(branch.lng) : "",
                hours_text: branch.hours_text || "",
                phone: branch.phone || "",
            },
        });
    }

    async function handleSaveBranch(e) {
        e.preventDefault();
        const { mode, data } = branchModal;
        setSaving(true);
        setError(null);
        try {
            const payload = {
                code: data.code.trim(),
                name: data.name.trim(),
                address: data.address.trim(),
                lat: parseFloat(data.lat) || 0,
                lng: parseFloat(data.lng) || 0,
                hours_text: data.hours_text.trim(),
                phone: data.phone.trim() || null,
            };
            if (mode === "create") {
                const res = await apiPost("/api/admin/branches", payload);
                setBranches((prev) => [...prev, res.branch]);
            } else {
                const res = await apiPatch(`/api/admin/branches/${data.id}`, payload);
                setBranches((prev) =>
                    prev.map((b) => (b.id === data.id ? res.branch : b))
                );
            }
            setBranchModal(null);
            showSuccess(mode === "create" ? "Sucursal creada." : "Sucursal actualizada.");
        } catch (err) {
            setError("Error al guardar sucursal: " + err.message);
        } finally {
            setSaving(false);
        }
    }

    async function handleDeleteBranch(id) {
        if (!window.confirm("¿Desactivar esta sucursal?")) return;
        try {
            const res = await apiDelete(`/api/admin/branches/${id}`);
            setBranches((prev) => prev.map((b) => (b.id === id ? res.branch : b)));
            showSuccess("Sucursal desactivada.");
        } catch (err) {
            setError("Error: " + err.message);
        }
    }

    // ── Servicios ──────────────────────────────────────────────────────────────

    function openCreateService() {
        setServiceModal({ mode: "create", data: { ...EMPTY_SERVICE } });
    }

    function openEditService(svc) {
        setServiceModal({
            mode: "edit",
            data: {
                id: svc.id,
                code: svc.code || "",
                name: svc.name || "",
                subtitle: svc.subtitle || "",
                description: svc.description || "",
                keywords: svc.keywords || "",
                price_bob: svc.price_bob != null ? String(svc.price_bob) : "",
                duration_min: svc.duration_min != null ? String(svc.duration_min) : "",
                is_featured: Boolean(svc.is_featured),
            },
        });
    }

    async function handleSaveService(e) {
        e.preventDefault();
        const { mode, data } = serviceModal;
        setSaving(true);
        setError(null);
        try {
            const payload = {
                code: data.code.trim(),
                name: data.name.trim(),
                subtitle: data.subtitle.trim() || null,
                description: data.description.trim(),
                keywords: data.keywords.trim() || null,
                price_bob: parseInt(data.price_bob) || 0,
                duration_min: data.duration_min ? parseInt(data.duration_min) : null,
                is_featured: Boolean(data.is_featured),
            };
            if (mode === "create") {
                const res = await apiPost("/api/admin/services", payload);
                setServices((prev) => [...prev, res.service]);
            } else {
                const res = await apiPatch(`/api/admin/services/${data.id}`, payload);
                setServices((prev) =>
                    prev.map((s) => (s.id === data.id ? res.service : s))
                );
            }
            setServiceModal(null);
            showSuccess(mode === "create" ? "Servicio creado." : "Servicio actualizado.");
        } catch (err) {
            setError("Error al guardar servicio: " + err.message);
        } finally {
            setSaving(false);
        }
    }

    async function handleDeleteService(id) {
        if (!window.confirm("¿Desactivar este servicio?")) return;
        try {
            const res = await apiDelete(`/api/admin/services/${id}`);
            setServices((prev) => prev.map((s) => (s.id === id ? res.service : s)));
            showSuccess("Servicio desactivado.");
        } catch (err) {
            setError("Error: " + err.message);
        }
    }

    // ── render ─────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="panel">
                <div className="panel-title">Empresa &amp; Bot</div>
                <div className="empty-state">Cargando...</div>
            </div>
        );
    }

    return (
        <div className="panel">
            <div className="panel-title">Empresa &amp; Bot</div>
            <p className="panel-subtitle" style={{ marginBottom: "1rem", color: "var(--text-secondary, #888)", fontSize: "0.85rem" }}>
                Esta informacion la usa el bot para responder inteligentemente. Cambia cualquier dato aqui sin necesidad de deploy.
            </p>

            {error && (
                <div className="notice-banner notice-banner--error" style={{ marginBottom: "1rem" }}>
                    {error}
                    <button className="notice-banner-dismiss" onClick={() => setError(null)}>×</button>
                </div>
            )}
            {success && (
                <div className="notice-banner notice-banner--success" style={{ marginBottom: "1rem" }}>
                    {success}
                </div>
            )}

            {/* Tabs */}
            <div className="settings-tabs" style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", borderBottom: "1px solid var(--border, #333)" }}>
                {[
                    { id: "identity", label: "Identidad" },
                    { id: "branches", label: `Sucursales (${branches.filter(b => b.is_active).length})` },
                    { id: "services", label: `Servicios (${services.filter(s => s.is_active).length})` },
                ].map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        className={`settings-tab-btn${tab === t.id ? " active" : ""}`}
                        style={{
                            padding: "0.5rem 1rem",
                            background: "none",
                            border: "none",
                            borderBottom: tab === t.id ? "2px solid var(--accent, #00e5ff)" : "2px solid transparent",
                            color: tab === t.id ? "var(--accent, #00e5ff)" : "var(--text-secondary, #888)",
                            cursor: "pointer",
                            fontWeight: tab === t.id ? "600" : "400",
                            fontSize: "0.9rem",
                        }}
                        onClick={() => setTab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Tab: Identidad */}
            {tab === "identity" && (
                <form onSubmit={handleSaveIdentity}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
                        {/* Empresa */}
                        <div>
                            <div className="settings-section-title" style={{ marginBottom: "1rem", fontWeight: "600" }}>
                                Empresa
                            </div>
                            <label className="settings-label">Nombre</label>
                            <input
                                className="settings-input"
                                value={company.name || ""}
                                onChange={(e) => setCompany((c) => ({ ...c, name: e.target.value }))}
                                placeholder="Ej: PODOPIE"
                            />
                            <label className="settings-label" style={{ marginTop: "0.75rem" }}>Slogan</label>
                            <input
                                className="settings-input"
                                value={company.slogan || ""}
                                onChange={(e) => setCompany((c) => ({ ...c, slogan: e.target.value }))}
                                placeholder="Ej: Especialistas en salud podologica"
                            />
                            <label className="settings-label" style={{ marginTop: "0.75rem" }}>Ciudad</label>
                            <input
                                className="settings-input"
                                value={company.city || ""}
                                onChange={(e) => setCompany((c) => ({ ...c, city: e.target.value }))}
                                placeholder="Ej: Santa Cruz, Bolivia"
                            />
                            <label className="settings-label" style={{ marginTop: "0.75rem" }}>Especialidad</label>
                            <input
                                className="settings-input"
                                value={company.specialty || ""}
                                onChange={(e) => setCompany((c) => ({ ...c, specialty: e.target.value }))}
                                placeholder="Ej: Podologia - solo trabajamos con pies"
                            />
                            <label className="settings-label" style={{ marginTop: "0.75rem" }}>
                                Servicios que NO ofrecemos
                                <span style={{ color: "var(--text-secondary, #888)", fontSize: "0.78rem", marginLeft: "0.5rem" }}>
                                    (el bot los ignorara)
                                </span>
                            </label>
                            <TagInput
                                value={Array.isArray(company.restrictions) ? company.restrictions : []}
                                onChange={(v) => setCompany((c) => ({ ...c, restrictions: v }))}
                                placeholder="Ej: manos, manicure..."
                            />
                        </div>

                        {/* Bot */}
                        <div>
                            <div className="settings-section-title" style={{ marginBottom: "1rem", fontWeight: "600" }}>
                                Personalidad del Bot
                            </div>
                            <label className="settings-label">Nombre del bot</label>
                            <input
                                className="settings-input"
                                value={botIdentity.name || ""}
                                onChange={(e) => setBotIdentity((b) => ({ ...b, name: e.target.value }))}
                                placeholder="Ej: PODITO"
                            />
                            <label className="settings-label" style={{ marginTop: "0.75rem" }}>Emoji principal</label>
                            <input
                                className="settings-input"
                                value={botIdentity.emoji || ""}
                                onChange={(e) => setBotIdentity((b) => ({ ...b, emoji: e.target.value }))}
                                placeholder="Ej: 🦶"
                                style={{ width: "5rem" }}
                            />
                            <label className="settings-label" style={{ marginTop: "0.75rem" }}>Tono</label>
                            <input
                                className="settings-input"
                                value={botIdentity.tone || ""}
                                onChange={(e) => setBotIdentity((b) => ({ ...b, tone: e.target.value }))}
                                placeholder="Ej: amable, calido, profesional"
                            />
                            <label className="settings-label" style={{ marginTop: "0.75rem" }}>Idioma / variante</label>
                            <input
                                className="settings-input"
                                value={botIdentity.language || ""}
                                onChange={(e) => setBotIdentity((b) => ({ ...b, language: e.target.value }))}
                                placeholder="Ej: espanol boliviano casual"
                            />
                            <label className="settings-label" style={{ marginTop: "0.75rem" }}>Maximo de oraciones por respuesta</label>
                            <input
                                className="settings-input"
                                type="number"
                                min="1"
                                max="6"
                                value={botIdentity.max_sentences || 2}
                                onChange={(e) => setBotIdentity((b) => ({ ...b, max_sentences: parseInt(e.target.value) || 2 }))}
                                style={{ width: "5rem" }}
                            />
                            <label className="settings-label" style={{ marginTop: "0.75rem" }}>
                                Emojis frecuentes
                            </label>
                            <TagInput
                                value={Array.isArray(botIdentity.emojis) ? botIdentity.emojis : []}
                                onChange={(v) => setBotIdentity((b) => ({ ...b, emojis: v }))}
                                placeholder="Ej: ✨"
                            />
                        </div>
                    </div>

                    <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={saving}
                        >
                            {saving ? "Guardando..." : "Guardar identidad"}
                        </button>
                    </div>
                </form>
            )}

            {/* Tab: Sucursales */}
            {tab === "branches" && (
                <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                        <span style={{ color: "var(--text-secondary, #888)", fontSize: "0.85rem" }}>
                            Las coordenadas (lat/lng) permiten al bot responder sobre la sucursal mas cercana.
                        </span>
                        <button className="btn btn-primary btn-sm" onClick={openCreateBranch}>
                            + Agregar sucursal
                        </button>
                    </div>

                    {branches.length === 0 ? (
                        <div className="empty-state">
                            No hay sucursales. Agrega la primera para que el bot conozca tu ubicacion.
                        </div>
                    ) : (
                        <div className="lines-grid" style={{ display: "grid", gap: "0.75rem" }}>
                            {branches.map((b) => (
                                <div
                                    key={b.id}
                                    className="line-card"
                                    style={{
                                        padding: "1rem",
                                        background: "var(--surface, #1e1e1e)",
                                        border: "1px solid var(--border, #333)",
                                        borderRadius: "8px",
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "flex-start",
                                        opacity: b.is_active ? 1 : 0.5,
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: "600", marginBottom: "0.25rem" }}>
                                            {b.name}
                                            <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "var(--text-secondary, #888)" }}>
                                                [{b.code}]
                                            </span>
                                            {!b.is_active && (
                                                <span style={{ marginLeft: "0.5rem", color: "#f87171", fontSize: "0.75rem" }}>Inactiva</span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: "0.82rem", color: "var(--text-secondary, #888)", marginBottom: "0.15rem" }}>
                                            {b.address}
                                        </div>
                                        <div style={{ fontSize: "0.82rem", color: "var(--text-secondary, #888)" }}>
                                            {b.hours_text}
                                        </div>
                                        {b.lat && b.lng ? (
                                            <div style={{ fontSize: "0.75rem", color: "#34d399", marginTop: "0.25rem" }}>
                                                📍 {b.lat}, {b.lng}
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: "0.75rem", color: "#f87171", marginTop: "0.25rem" }}>
                                                ⚠ Sin coordenadas — el bot no puede calcular distancias
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: "flex", gap: "0.5rem" }}>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => openEditBranch(b)}
                                        >
                                            Editar
                                        </button>
                                        {b.is_active && (
                                            <button
                                                className="btn btn-danger btn-sm"
                                                onClick={() => handleDeleteBranch(b.id)}
                                            >
                                                Desactivar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Modal sucursal */}
                    {branchModal && (
                        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setBranchModal(null)}>
                            <div className="modal-content" style={{ maxWidth: "560px" }}>
                                <div className="modal-header">
                                    <h3>{branchModal.mode === "create" ? "Nueva sucursal" : "Editar sucursal"}</h3>
                                    <button className="modal-close" onClick={() => setBranchModal(null)}>×</button>
                                </div>
                                <form onSubmit={handleSaveBranch}>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", padding: "1rem" }}>
                                        <div>
                                            <label className="settings-label">Codigo *</label>
                                            <input className="settings-input" value={branchModal.data.code}
                                                onChange={(e) => setBranchModal((m) => ({ ...m, data: { ...m.data, code: e.target.value } }))}
                                                placeholder="Ej: central" required />
                                        </div>
                                        <div>
                                            <label className="settings-label">Nombre *</label>
                                            <input className="settings-input" value={branchModal.data.name}
                                                onChange={(e) => setBranchModal((m) => ({ ...m, data: { ...m.data, name: e.target.value } }))}
                                                placeholder="Ej: PODOPIE Central" required />
                                        </div>
                                        <div style={{ gridColumn: "1 / -1" }}>
                                            <label className="settings-label">Direccion *</label>
                                            <input className="settings-input" value={branchModal.data.address}
                                                onChange={(e) => setBranchModal((m) => ({ ...m, data: { ...m.data, address: e.target.value } }))}
                                                placeholder="Ej: Av. Cristo Redentor 350" required />
                                        </div>
                                        <div>
                                            <label className="settings-label">Latitud</label>
                                            <input className="settings-input" type="number" step="any"
                                                value={branchModal.data.lat}
                                                onChange={(e) => setBranchModal((m) => ({ ...m, data: { ...m.data, lat: e.target.value } }))}
                                                placeholder="-17.7833" />
                                        </div>
                                        <div>
                                            <label className="settings-label">Longitud</label>
                                            <input className="settings-input" type="number" step="any"
                                                value={branchModal.data.lng}
                                                onChange={(e) => setBranchModal((m) => ({ ...m, data: { ...m.data, lng: e.target.value } }))}
                                                placeholder="-63.1821" />
                                        </div>
                                        <div style={{ gridColumn: "1 / -1" }}>
                                            <label className="settings-label">Horario *</label>
                                            <input className="settings-input" value={branchModal.data.hours_text}
                                                onChange={(e) => setBranchModal((m) => ({ ...m, data: { ...m.data, hours_text: e.target.value } }))}
                                                placeholder="Lun-Vie: 8:00-20:00, Sab: 8:00-14:00" required />
                                        </div>
                                        <div>
                                            <label className="settings-label">Telefono</label>
                                            <input className="settings-input" value={branchModal.data.phone}
                                                onChange={(e) => setBranchModal((m) => ({ ...m, data: { ...m.data, phone: e.target.value } }))}
                                                placeholder="+591..." />
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", padding: "0 1rem 1rem" }}>
                                        <button type="button" className="btn btn-secondary" onClick={() => setBranchModal(null)}>
                                            Cancelar
                                        </button>
                                        <button type="submit" className="btn btn-primary" disabled={saving}>
                                            {saving ? "Guardando..." : "Guardar"}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Tab: Servicios */}
            {tab === "services" && (
                <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                        <span style={{ color: "var(--text-secondary, #888)", fontSize: "0.85rem" }}>
                            El bot conoce estos servicios y los usa para responder preguntas de precio, duracion y disponibilidad.
                        </span>
                        <button className="btn btn-primary btn-sm" onClick={openCreateService}>
                            + Agregar servicio
                        </button>
                    </div>

                    {services.length === 0 ? (
                        <div className="empty-state">
                            No hay servicios. Agrega los servicios que ofrece tu empresa.
                        </div>
                    ) : (
                        <div style={{ display: "grid", gap: "0.75rem" }}>
                            {services.map((s) => (
                                <div
                                    key={s.id}
                                    style={{
                                        padding: "1rem",
                                        background: "var(--surface, #1e1e1e)",
                                        border: "1px solid var(--border, #333)",
                                        borderRadius: "8px",
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "flex-start",
                                        opacity: s.is_active ? 1 : 0.5,
                                    }}
                                >
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: "600", marginBottom: "0.25rem" }}>
                                            {s.name}
                                            <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "var(--text-secondary, #888)" }}>
                                                [{s.code}]
                                            </span>
                                            {s.is_featured && (
                                                <span style={{ marginLeft: "0.5rem", color: "#fbbf24", fontSize: "0.75rem" }}>★ Destacado</span>
                                            )}
                                            {!s.is_active && (
                                                <span style={{ marginLeft: "0.5rem", color: "#f87171", fontSize: "0.75rem" }}>Inactivo</span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: "0.82rem", color: "var(--text-secondary, #888)", marginBottom: "0.25rem", maxWidth: "500px" }}>
                                            {s.description}
                                        </div>
                                        <div style={{ display: "flex", gap: "1rem", fontSize: "0.8rem" }}>
                                            {s.price_bob > 0 && (
                                                <span style={{ color: "#34d399" }}>Bs. {s.price_bob}</span>
                                            )}
                                            {s.duration_min && (
                                                <span style={{ color: "var(--text-secondary, #888)" }}>{s.duration_min} min</span>
                                            )}
                                            {s.keywords && (
                                                <span style={{ color: "var(--text-secondary, #888)" }}>🏷 {s.keywords}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                                        <button className="btn btn-secondary btn-sm" onClick={() => openEditService(s)}>
                                            Editar
                                        </button>
                                        {s.is_active && (
                                            <button className="btn btn-danger btn-sm" onClick={() => handleDeleteService(s.id)}>
                                                Desactivar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Modal servicio */}
                    {serviceModal && (
                        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setServiceModal(null)}>
                            <div className="modal-content" style={{ maxWidth: "600px" }}>
                                <div className="modal-header">
                                    <h3>{serviceModal.mode === "create" ? "Nuevo servicio" : "Editar servicio"}</h3>
                                    <button className="modal-close" onClick={() => setServiceModal(null)}>×</button>
                                </div>
                                <form onSubmit={handleSaveService}>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", padding: "1rem" }}>
                                        <div>
                                            <label className="settings-label">Codigo *</label>
                                            <input className="settings-input" value={serviceModal.data.code}
                                                onChange={(e) => setServiceModal((m) => ({ ...m, data: { ...m.data, code: e.target.value } }))}
                                                placeholder="Ej: hongos" required />
                                        </div>
                                        <div>
                                            <label className="settings-label">Nombre *</label>
                                            <input className="settings-input" value={serviceModal.data.name}
                                                onChange={(e) => setServiceModal((m) => ({ ...m, data: { ...m.data, name: e.target.value } }))}
                                                placeholder="Ej: Tratamiento de Hongos" required />
                                        </div>
                                        <div style={{ gridColumn: "1 / -1" }}>
                                            <label className="settings-label">Subtitulo</label>
                                            <input className="settings-input" value={serviceModal.data.subtitle}
                                                onChange={(e) => setServiceModal((m) => ({ ...m, data: { ...m.data, subtitle: e.target.value } }))}
                                                placeholder="Ej: Onicomicosis y pie de atleta" />
                                        </div>
                                        <div style={{ gridColumn: "1 / -1" }}>
                                            <label className="settings-label">Descripcion *</label>
                                            <textarea className="settings-input" rows="3" value={serviceModal.data.description}
                                                onChange={(e) => setServiceModal((m) => ({ ...m, data: { ...m.data, description: e.target.value } }))}
                                                placeholder="Descripcion que el bot usara al responder sobre este servicio" required
                                                style={{ resize: "vertical" }} />
                                        </div>
                                        <div style={{ gridColumn: "1 / -1" }}>
                                            <label className="settings-label">
                                                Palabras clave
                                                <span style={{ color: "var(--text-secondary, #888)", fontSize: "0.78rem", marginLeft: "0.5rem" }}>
                                                    (separadas por coma — ayudan al bot a reconocer cuando el usuario habla de este servicio)
                                                </span>
                                            </label>
                                            <input className="settings-input" value={serviceModal.data.keywords}
                                                onChange={(e) => setServiceModal((m) => ({ ...m, data: { ...m.data, keywords: e.target.value } }))}
                                                placeholder="Ej: hongo, onicomicosis, uña negra, pie de atleta" />
                                        </div>
                                        <div>
                                            <label className="settings-label">Precio (Bs.)</label>
                                            <input className="settings-input" type="number" min="0" value={serviceModal.data.price_bob}
                                                onChange={(e) => setServiceModal((m) => ({ ...m, data: { ...m.data, price_bob: e.target.value } }))}
                                                placeholder="150" />
                                        </div>
                                        <div>
                                            <label className="settings-label">Duracion (minutos)</label>
                                            <input className="settings-input" type="number" min="0" value={serviceModal.data.duration_min}
                                                onChange={(e) => setServiceModal((m) => ({ ...m, data: { ...m.data, duration_min: e.target.value } }))}
                                                placeholder="30" />
                                        </div>
                                        <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                            <input type="checkbox" id="is_featured"
                                                checked={serviceModal.data.is_featured}
                                                onChange={(e) => setServiceModal((m) => ({ ...m, data: { ...m.data, is_featured: e.target.checked } }))} />
                                            <label htmlFor="is_featured" style={{ cursor: "pointer", userSelect: "none" }}>
                                                Servicio destacado (aparece primero en las sugerencias del bot)
                                            </label>
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", padding: "0 1rem 1rem" }}>
                                        <button type="button" className="btn btn-secondary" onClick={() => setServiceModal(null)}>
                                            Cancelar
                                        </button>
                                        <button type="submit" className="btn btn-primary" disabled={saving}>
                                            {saving ? "Guardando..." : "Guardar"}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default CompanySection;
