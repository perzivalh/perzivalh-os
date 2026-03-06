import React, { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api";

const COMPANY = { name: "", slogan: "", city: "", specialty: "", restrictions: [] };
const BOT = { name: "", emoji: "", tone: "", language: "", max_sentences: 2, emojis: [] };
const BRANCH = { code: "", name: "", address: "", lat: "", lng: "", maps_url: "", hours_text: "", phone: "" };
const SERVICE = { code: "", name: "", subtitle: "", description: "", keywords: "", price_bob: "", is_featured: false };
const cardStyle = { background: "var(--surface, #1e1e1e)", border: "1px solid var(--border, #333)", borderRadius: "14px", padding: "1rem" };
const gridTwo = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.85rem" };
const fieldWrap = { display: "grid", gap: "0.4rem", minWidth: 0 };

function Field({ label, hint, children }) {
    return (
        <div style={fieldWrap}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "baseline" }}>
                <label className="settings-label" style={{ display: "block", margin: 0 }}>{label}</label>
                {hint ? <span style={{ color: "var(--text-secondary, #888)", fontSize: "0.75rem" }}>{hint}</span> : null}
            </div>
            {children}
        </div>
    );
}

function Card({ title, copy, children }) {
    return (
        <section style={{ ...cardStyle, display: "grid", gap: "0.9rem" }}>
            <div style={{ display: "grid", gap: "0.3rem" }}>
                <div className="settings-section-title" style={{ margin: 0, fontWeight: 700 }}>{title}</div>
                {copy ? <p style={{ margin: 0, color: "var(--text-secondary, #888)", fontSize: "0.82rem", lineHeight: 1.45 }}>{copy}</p> : null}
            </div>
            {children}
        </section>
    );
}

function Tags({ value = [], onChange, placeholder, disabled = false }) {
    const [input, setInput] = useState("");
    function addTag() {
        if (disabled) return;
        const tag = input.trim();
        if (!tag) return;
        if (!value.includes(tag)) onChange([...value, tag]);
        setInput("");
    }
    function removeTag(tag) {
        if (disabled) return;
        onChange(value.filter((item) => item !== tag));
    }
    return (
        <div style={{ display: "grid", gap: "0.55rem" }}>
            {value.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
                    {value.map((tag) => (
                        <span key={tag} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.26rem 0.55rem", borderRadius: "999px", background: "rgba(255,255,255,0.06)", border: "1px solid var(--border, #333)", fontSize: "0.78rem" }}>
                            {tag}
                            <button type="button" onClick={() => removeTag(tag)} disabled={disabled} style={{ background: "none", border: "none", color: "inherit", cursor: disabled ? "not-allowed" : "pointer", padding: 0, lineHeight: 1 }}>x</button>
                        </span>
                    ))}
                </div>
            ) : null}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.5rem" }}>
                <input className="settings-input" value={input} placeholder={placeholder || "Agregar..."} disabled={disabled} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} />
                <button type="button" className="btn btn-secondary btn-sm" onClick={addTag} disabled={disabled}>+</button>
            </div>
        </div>
    );
}

function CompanySection({ canManageCompany = false }) {
    const [tab, setTab] = useState("identity");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [company, setCompany] = useState(COMPANY);
    const [botIdentity, setBotIdentity] = useState(BOT);
    const [branches, setBranches] = useState([]);
    const [services, setServices] = useState([]);
    const [branchModal, setBranchModal] = useState(null);
    const [serviceModal, setServiceModal] = useState(null);

    useEffect(() => { void loadAll(); }, []);

    function flash(message) {
        setSuccess(message);
        setTimeout(() => setSuccess(""), 3000);
    }

    async function loadAll() {
        setLoading(true);
        setError("");
        try {
            const [profileRes, branchesRes, servicesRes] = await Promise.all([apiGet("/api/admin/company-profile"), apiGet("/api/admin/branches"), apiGet("/api/admin/services")]);
            setCompany(profileRes.company || COMPANY);
            setBotIdentity(profileRes.botIdentity || BOT);
            setBranches(Array.isArray(branchesRes.branches) ? branchesRes.branches : []);
            setServices(Array.isArray(servicesRes.services) ? servicesRes.services : []);
        } catch (err) {
            setError(`No se pudo cargar la informacion: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }

    async function saveIdentity(e) {
        e.preventDefault();
        if (!canManageCompany) return;
        setSaving(true);
        setError("");
        try {
            await apiPatch("/api/admin/company-profile", { company, botIdentity });
            flash("Identidad guardada.");
        } catch (err) {
            setError(`Error al guardar identidad: ${err.message}`);
        } finally {
            setSaving(false);
        }
    }

    function editBranch(branch) {
        if (!canManageCompany) return;
        setBranchModal(branch ? { mode: "edit", data: { id: branch.id, code: branch.code || "", name: branch.name || "", address: branch.address || "", lat: branch.lat != null ? String(branch.lat) : "", lng: branch.lng != null ? String(branch.lng) : "", maps_url: branch.maps_url || "", hours_text: branch.hours_text || "", phone: branch.phone || "" } } : { mode: "create", data: { ...BRANCH } });
    }

    async function saveBranch(e) {
        e.preventDefault();
        if (!canManageCompany) return;
        if (!branchModal) return;
        const { mode, data } = branchModal;
        setSaving(true);
        setError("");
        const payload = { code: data.code.trim(), name: data.name.trim(), address: data.address.trim(), lat: parseFloat(data.lat) || 0, lng: parseFloat(data.lng) || 0, maps_url: data.maps_url.trim() || null, hours_text: data.hours_text.trim(), phone: data.phone.trim() || null };
        try {
            const res = mode === "create" ? await apiPost("/api/admin/branches", payload) : await apiPatch(`/api/admin/branches/${data.id}`, payload);
            setBranches((prev) => mode === "create" ? [...prev, res.branch] : prev.map((item) => item.id === data.id ? res.branch : item));
            setBranchModal(null);
            flash(mode === "create" ? "Sucursal creada." : "Sucursal actualizada.");
        } catch (err) {
            setError(`Error al guardar sucursal: ${err.message}`);
        } finally {
            setSaving(false);
        }
    }

    async function disableBranch(id) {
        if (!canManageCompany) return;
        if (!window.confirm("Desactivar esta sucursal?")) return;
        try {
            const res = await apiDelete(`/api/admin/branches/${id}`);
            setBranches((prev) => prev.map((item) => item.id === id ? res.branch : item));
            flash("Sucursal desactivada.");
        } catch (err) {
            setError(`Error al desactivar sucursal: ${err.message}`);
        }
    }

    function editService(service) {
        if (!canManageCompany) return;
        setServiceModal(service ? { mode: "edit", data: { id: service.id, code: service.code || "", name: service.name || "", subtitle: service.subtitle || "", description: service.description || "", keywords: service.keywords || "", price_bob: service.price_bob != null ? String(service.price_bob) : "", is_featured: Boolean(service.is_featured) } } : { mode: "create", data: { ...SERVICE } });
    }

    async function saveService(e) {
        e.preventDefault();
        if (!canManageCompany) return;
        if (!serviceModal) return;
        const { mode, data } = serviceModal;
        setSaving(true);
        setError("");
        const payload = { code: data.code.trim(), name: data.name.trim(), subtitle: data.subtitle.trim() || null, description: data.description.trim(), keywords: data.keywords.trim() || null, price_bob: parseInt(data.price_bob, 10) || 0, is_featured: Boolean(data.is_featured) };
        try {
            const res = mode === "create" ? await apiPost("/api/admin/services", payload) : await apiPatch(`/api/admin/services/${data.id}`, payload);
            setServices((prev) => mode === "create" ? [...prev, res.service] : prev.map((item) => item.id === data.id ? res.service : item));
            setServiceModal(null);
            flash(mode === "create" ? "Servicio creado." : "Servicio actualizado.");
        } catch (err) {
            setError(`Error al guardar servicio: ${err.message}`);
        } finally {
            setSaving(false);
        }
    }

    async function disableService(id) {
        if (!canManageCompany) return;
        if (!window.confirm("Desactivar este servicio?")) return;
        try {
            const res = await apiDelete(`/api/admin/services/${id}`);
            setServices((prev) => prev.map((item) => item.id === id ? res.service : item));
            flash("Servicio desactivado.");
        } catch (err) {
            setError(`Error al desactivar servicio: ${err.message}`);
        }
    }

    const activeBranches = branches.filter((item) => item.is_active !== false);
    const activeServices = services.filter((item) => item.is_active !== false);

    if (loading) return <div className="panel"><div className="panel-title">Empresa &amp; Bot</div><div className="empty-state">Cargando...</div></div>;

    return (
        <div className="panel" style={{ display: "grid", gap: "1rem" }}>
            <div style={{ display: "grid", gap: "0.4rem" }}>
                <div className="panel-title">Empresa &amp; Bot</div>
                <p className="panel-subtitle" style={{ margin: 0, color: "var(--text-secondary, #888)", fontSize: "0.85rem" }}>Esta informacion alimenta el contexto de la IA y ya no depende de un deploy.</p>
            </div>
            {error ? <div className="notice-banner notice-banner-error">{error}</div> : null}
            {success ? <div className="notice-banner" style={{ background: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.35)", color: "#86efac" }}>{success}</div> : null}
            {!canManageCompany ? <div className="notice-banner">Modo solo lectura para este rol.</div> : null}
            <div style={{ display: "flex", gap: "0.5rem", paddingBottom: "0.8rem", borderBottom: "1px solid var(--border, #333)", overflowX: "auto" }}>
                {[{ id: "identity", label: "Identidad" }, { id: "branches", label: `Sucursales (${activeBranches.length})` }, { id: "services", label: `Servicios (${activeServices.length})` }].map((item) => (
                    <button key={item.id} type="button" className={`settings-tab-btn${tab === item.id ? " active" : ""}`} style={{ padding: "0.55rem 0.95rem", background: tab === item.id ? "rgba(37,99,235,0.14)" : "transparent", border: "1px solid", borderColor: tab === item.id ? "rgba(37,99,235,0.35)" : "transparent", borderRadius: "999px", color: tab === item.id ? "#dbeafe" : "var(--text-secondary, #888)", cursor: "pointer", fontWeight: tab === item.id ? 700 : 500, whiteSpace: "nowrap" }} onClick={() => setTab(item.id)}>{item.label}</button>
                ))}
            </div>
            {tab === "identity" ? (
                <fieldset disabled={!canManageCompany || saving} style={{ border: "none", margin: 0, padding: 0, minInlineSize: 0 }}>
                <form onSubmit={saveIdentity} style={{ display: "grid", gap: "1rem" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem" }}>
                        <Card title="Empresa" copy="Datos fijos de negocio que usa la IA al hablar de tu clinica.">
                            <div style={gridTwo}>
                                <Field label="Nombre"><input className="settings-input" value={company.name || ""} onChange={(e) => setCompany((prev) => ({ ...prev, name: e.target.value }))} placeholder="Ej: PODOPIE" /></Field>
                                <Field label="Ciudad"><input className="settings-input" value={company.city || ""} onChange={(e) => setCompany((prev) => ({ ...prev, city: e.target.value }))} placeholder="Ej: Santa Cruz, Bolivia" /></Field>
                                <div style={{ gridColumn: "1 / -1" }}><Field label="Slogan"><input className="settings-input" value={company.slogan || ""} onChange={(e) => setCompany((prev) => ({ ...prev, slogan: e.target.value }))} placeholder="Ej: Especialistas en salud podologica" /></Field></div>
                                <div style={{ gridColumn: "1 / -1" }}><Field label="Especialidad"><input className="settings-input" value={company.specialty || ""} onChange={(e) => setCompany((prev) => ({ ...prev, specialty: e.target.value }))} placeholder="Ej: Podologia - solo trabajamos con pies" /></Field></div>
                                <div style={{ gridColumn: "1 / -1" }}><Field label="Servicios que NO ofrecemos" hint="el bot los descarta"><Tags value={Array.isArray(company.restrictions) ? company.restrictions : []} onChange={(next) => setCompany((prev) => ({ ...prev, restrictions: next }))} placeholder="Ej: manos, manicure..." disabled={!canManageCompany} /></Field></div>
                            </div>
                        </Card>
                        <Card title="Personalidad del Bot" copy="Define la voz de Podito cuando la IA responde al cliente.">
                            <div style={gridTwo}>
                                <Field label="Nombre del bot"><input className="settings-input" value={botIdentity.name || ""} onChange={(e) => setBotIdentity((prev) => ({ ...prev, name: e.target.value }))} placeholder="Ej: PODITO" /></Field>
                                <Field label="Emoji principal"><input className="settings-input" value={botIdentity.emoji || ""} onChange={(e) => setBotIdentity((prev) => ({ ...prev, emoji: e.target.value }))} placeholder="Ej: podito" /></Field>
                                <div style={{ gridColumn: "1 / -1" }}><Field label="Tono"><input className="settings-input" value={botIdentity.tone || ""} onChange={(e) => setBotIdentity((prev) => ({ ...prev, tone: e.target.value }))} placeholder="Ej: amable, calido, profesional" /></Field></div>
                                <Field label="Idioma / variante"><input className="settings-input" value={botIdentity.language || ""} onChange={(e) => setBotIdentity((prev) => ({ ...prev, language: e.target.value }))} placeholder="Ej: espanol boliviano casual" /></Field>
                                <Field label="Maximo de oraciones"><input className="settings-input" type="number" min="1" max="6" value={botIdentity.max_sentences || 2} onChange={(e) => setBotIdentity((prev) => ({ ...prev, max_sentences: parseInt(e.target.value, 10) || 2 }))} /></Field>
                                <div style={{ gridColumn: "1 / -1" }}><Field label="Emojis frecuentes"><Tags value={Array.isArray(botIdentity.emojis) ? botIdentity.emojis : []} onChange={(next) => setBotIdentity((prev) => ({ ...prev, emojis: next }))} placeholder="Ej: saludo, apoyo, cierre" disabled={!canManageCompany} /></Field></div>
                            </div>
                        </Card>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}><button type="submit" className="btn btn-primary" disabled={!canManageCompany || saving}>{saving ? "Guardando..." : "Guardar identidad"}</button></div>
                </form>
                </fieldset>
            ) : null}
            {tab === "branches" ? (
                <fieldset disabled={!canManageCompany || saving} style={{ border: "none", margin: 0, padding: 0, minInlineSize: 0 }}>
                <div style={{ display: "grid", gap: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ color: "var(--text-secondary, #888)", fontSize: "0.84rem" }}>Guarda direccion, coordenadas y Maps para que la IA ubique sucursales.</span>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => editBranch(null)} disabled={!canManageCompany}>+ Agregar sucursal</button>
                    </div>
                    {branches.length === 0 ? <div className="empty-state">No hay sucursales registradas.</div> : <div style={{ display: "grid", gap: "0.75rem" }}>{branches.map((branch) => <div key={branch.id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", opacity: branch.is_active === false ? 0.58 : 1 }}><div style={{ display: "grid", gap: "0.35rem", minWidth: 0 }}><div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", alignItems: "center" }}><strong>{branch.name}</strong><span style={{ color: "var(--text-secondary, #888)", fontSize: "0.76rem" }}>[{branch.code}]</span>{branch.is_active === false ? <span style={{ color: "#fca5a5", fontSize: "0.76rem" }}>Inactiva</span> : null}</div><div style={{ color: "var(--text-secondary, #888)", fontSize: "0.82rem" }}>{branch.address}</div><div style={{ color: "var(--text-secondary, #888)", fontSize: "0.82rem" }}>{branch.hours_text}</div>{branch.phone ? <div style={{ color: "var(--text-secondary, #888)", fontSize: "0.8rem" }}>Tel: {branch.phone}</div> : null}{branch.lat != null && branch.lng != null ? <div style={{ color: "#86efac", fontSize: "0.76rem" }}>Coord: {branch.lat}, {branch.lng}</div> : <div style={{ color: "#fca5a5", fontSize: "0.76rem" }}>Faltan coordenadas.</div>}{branch.maps_url ? <a href={branch.maps_url} target="_blank" rel="noreferrer" style={{ color: "#93c5fd", fontSize: "0.78rem", textDecoration: "none" }}>Abrir Google Maps</a> : null}</div><div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}><button type="button" className="btn btn-secondary btn-sm" onClick={() => editBranch(branch)}>Editar</button>{branch.is_active !== false ? <button type="button" className="btn btn-danger btn-sm" onClick={() => disableBranch(branch.id)}>Desactivar</button> : null}</div></div>)}</div>}
                    {branchModal ? <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setBranchModal(null)}><div className="modal-content" style={{ maxWidth: "620px" }}><div className="modal-header"><h3>{branchModal.mode === "create" ? "Nueva sucursal" : "Editar sucursal"}</h3><button type="button" className="modal-close" onClick={() => setBranchModal(null)}>x</button></div><form onSubmit={saveBranch}><div style={{ display: "grid", gap: "1rem", padding: "1rem" }}><div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.75rem" }}><Field label="Codigo *"><input className="settings-input" value={branchModal.data.code} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, code: e.target.value } }))} placeholder="Ej: central" required /></Field><Field label="Nombre *"><input className="settings-input" value={branchModal.data.name} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, name: e.target.value } }))} placeholder="Ej: PODOPIE Central" required /></Field></div><Field label="Direccion *"><input className="settings-input" value={branchModal.data.address} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, address: e.target.value } }))} placeholder="Ej: Av. Cristo Redentor 350" required /></Field><div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.75rem" }}><Field label="Latitud"><input className="settings-input" type="number" step="any" value={branchModal.data.lat} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, lat: e.target.value } }))} placeholder="-17.7833" /></Field><Field label="Longitud"><input className="settings-input" type="number" step="any" value={branchModal.data.lng} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, lng: e.target.value } }))} placeholder="-63.1821" /></Field></div><Field label="Link Google Maps"><input className="settings-input" value={branchModal.data.maps_url} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, maps_url: e.target.value } }))} placeholder="https://maps.app.goo.gl/..." /></Field><Field label="Horario *"><input className="settings-input" value={branchModal.data.hours_text} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, hours_text: e.target.value } }))} placeholder="Lun-Vie 8:00-20:00, Sab 8:00-14:00" required /></Field><Field label="Telefono"><input className="settings-input" value={branchModal.data.phone} onChange={(e) => setBranchModal((prev) => ({ ...prev, data: { ...prev.data, phone: e.target.value } }))} placeholder="+591..." /></Field></div><div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", padding: "0 1rem 1rem" }}><button type="button" className="btn btn-secondary" onClick={() => setBranchModal(null)}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button></div></form></div></div> : null}
                </div>
                </fieldset>
            ) : null}
            {tab === "services" ? (
                <fieldset disabled={!canManageCompany || saving} style={{ border: "none", margin: 0, padding: 0, minInlineSize: 0 }}>
                <div style={{ display: "grid", gap: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ color: "var(--text-secondary, #888)", fontSize: "0.84rem" }}>El bot usa nombre, descripcion, keywords y precio. Ya no mostramos tiempo aqui.</span>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => editService(null)} disabled={!canManageCompany}>+ Agregar servicio</button>
                    </div>
                    {services.length === 0 ? <div className="empty-state">No hay servicios registrados.</div> : <div style={{ display: "grid", gap: "0.75rem" }}>{services.map((service) => <div key={service.id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", opacity: service.is_active === false ? 0.58 : 1 }}><div style={{ display: "grid", gap: "0.35rem", minWidth: 0 }}><div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", alignItems: "center" }}><strong>{service.name}</strong><span style={{ color: "var(--text-secondary, #888)", fontSize: "0.76rem" }}>[{service.code}]</span>{service.is_featured ? <span style={{ color: "#fcd34d", fontSize: "0.76rem" }}>Destacado</span> : null}{service.is_active === false ? <span style={{ color: "#fca5a5", fontSize: "0.76rem" }}>Inactivo</span> : null}</div>{service.subtitle ? <div style={{ color: "#cbd5e1", fontSize: "0.8rem" }}>{service.subtitle}</div> : null}<div style={{ color: "var(--text-secondary, #888)", fontSize: "0.82rem", maxWidth: "640px" }}>{service.description}</div><div style={{ display: "flex", flexWrap: "wrap", gap: "0.9rem", fontSize: "0.8rem" }}>{service.price_bob > 0 ? <span style={{ color: "#86efac" }}>Bs. {service.price_bob}</span> : null}{service.keywords ? <span style={{ color: "var(--text-secondary, #888)" }}>Keywords: {service.keywords}</span> : null}</div></div><div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}><button type="button" className="btn btn-secondary btn-sm" onClick={() => editService(service)}>Editar</button>{service.is_active !== false ? <button type="button" className="btn btn-danger btn-sm" onClick={() => disableService(service.id)}>Desactivar</button> : null}</div></div>)}</div>}
                    {serviceModal ? <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setServiceModal(null)}><div className="modal-content" style={{ maxWidth: "640px" }}><div className="modal-header"><h3>{serviceModal.mode === "create" ? "Nuevo servicio" : "Editar servicio"}</h3><button type="button" className="modal-close" onClick={() => setServiceModal(null)}>x</button></div><form onSubmit={saveService}><div style={{ display: "grid", gap: "1rem", padding: "1rem" }}><div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.75rem" }}><Field label="Codigo *"><input className="settings-input" value={serviceModal.data.code} onChange={(e) => setServiceModal((prev) => ({ ...prev, data: { ...prev.data, code: e.target.value } }))} placeholder="Ej: hongos" required /></Field><Field label="Nombre *"><input className="settings-input" value={serviceModal.data.name} onChange={(e) => setServiceModal((prev) => ({ ...prev, data: { ...prev.data, name: e.target.value } }))} placeholder="Ej: Tratamiento de hongos" required /></Field></div><Field label="Subtitulo"><input className="settings-input" value={serviceModal.data.subtitle} onChange={(e) => setServiceModal((prev) => ({ ...prev, data: { ...prev.data, subtitle: e.target.value } }))} placeholder="Ej: Onicomicosis y pie de atleta" /></Field><Field label="Descripcion *"><textarea className="settings-input" rows="3" value={serviceModal.data.description} onChange={(e) => setServiceModal((prev) => ({ ...prev, data: { ...prev.data, description: e.target.value } }))} placeholder="Describe como el bot debe explicar este servicio" required style={{ resize: "vertical" }} /></Field><Field label="Palabras clave" hint="separadas por coma para matching"><input className="settings-input" value={serviceModal.data.keywords} onChange={(e) => setServiceModal((prev) => ({ ...prev, data: { ...prev.data, keywords: e.target.value } }))} placeholder="Ej: hongo, onicomicosis, una amarilla" /></Field><div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.75rem" }}><Field label="Precio (Bs.)"><input className="settings-input" type="number" min="0" value={serviceModal.data.price_bob} onChange={(e) => setServiceModal((prev) => ({ ...prev, data: { ...prev.data, price_bob: e.target.value } }))} placeholder="150" /></Field><Field label="Prioridad visual" hint="aparece primero"><label style={{ display: "flex", alignItems: "center", gap: "0.5rem", minHeight: "42px", cursor: "pointer" }}><input type="checkbox" checked={serviceModal.data.is_featured} onChange={(e) => setServiceModal((prev) => ({ ...prev, data: { ...prev.data, is_featured: e.target.checked } }))} /><span>Marcar como destacado</span></label></Field></div></div><div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", padding: "0 1rem 1rem" }}><button type="button" className="btn btn-secondary" onClick={() => setServiceModal(null)}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button></div></form></div></div> : null}
                </div>
                </fieldset>
            ) : null}
        </div>
    );
}

export default CompanySection;
