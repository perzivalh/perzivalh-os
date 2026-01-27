/**
 * GeneralSection - Sucursales, Servicios, Canales WhatsApp
 */
import React from "react";

function GeneralSection({
    branches,
    branchForm,
    setBranchForm,
    handleBranchSubmit,
    handleBranchDisable,
    services,
    serviceForm,
    setServiceForm,
    handleServiceSubmit,
    handleServiceDisable,
    handleServiceBranchToggle,
    tenantChannels,
    channelForm,
    setChannelForm,
    handleChannelSelect,
    handleChannelSubmit,
}) {
    return (
        <div className="page-grid">
            {/* Sucursales Panel */}
            <div className="panel">
                <div className="panel-title">Sucursales</div>
                <div className="table">
                    <div className="table-head">
                        <span>Nombre</span>
                        <span>Codigo</span>
                        <span>Estado</span>
                        <span>Accion</span>
                    </div>
                    {branches.map((branch) => (
                        <div className="table-row" key={branch.id}>
                            <span>{branch.name}</span>
                            <span>{branch.code}</span>
                            <span>{branch.is_active ? "Activa" : "Inactiva"}</span>
                            <div className="row-actions">
                                <button
                                    className="ghost"
                                    onClick={() =>
                                        setBranchForm({
                                            id: branch.id,
                                            code: branch.code,
                                            name: branch.name,
                                            address: branch.address,
                                            lat: branch.lat,
                                            lng: branch.lng,
                                            hours_text: branch.hours_text,
                                            phone: branch.phone || "",
                                            is_active: branch.is_active,
                                        })
                                    }
                                >
                                    Editar
                                </button>
                                <button
                                    className="danger"
                                    onClick={() => handleBranchDisable(branch.id)}
                                >
                                    Desactivar
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="panel-title">
                    {branchForm.id ? "Editar sucursal" : "Crear sucursal"}
                </div>
                <form className="form-grid" onSubmit={handleBranchSubmit}>
                    <label className="field">
                        <span>Codigo</span>
                        <input
                            type="text"
                            value={branchForm.code}
                            onChange={(event) =>
                                setBranchForm((prev) => ({
                                    ...prev,
                                    code: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <label className="field">
                        <span>Nombre</span>
                        <input
                            type="text"
                            value={branchForm.name}
                            onChange={(event) =>
                                setBranchForm((prev) => ({
                                    ...prev,
                                    name: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <label className="field">
                        <span>Direccion</span>
                        <input
                            type="text"
                            value={branchForm.address}
                            onChange={(event) =>
                                setBranchForm((prev) => ({
                                    ...prev,
                                    address: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <label className="field">
                        <span>Lat</span>
                        <input
                            type="number"
                            value={branchForm.lat}
                            onChange={(event) =>
                                setBranchForm((prev) => ({
                                    ...prev,
                                    lat: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <label className="field">
                        <span>Lng</span>
                        <input
                            type="number"
                            value={branchForm.lng}
                            onChange={(event) =>
                                setBranchForm((prev) => ({
                                    ...prev,
                                    lng: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <label className="field">
                        <span>Telefono</span>
                        <input
                            type="text"
                            value={branchForm.phone}
                            onChange={(event) =>
                                setBranchForm((prev) => ({
                                    ...prev,
                                    phone: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <label className="field">
                        <span>Horarios</span>
                        <textarea
                            rows="3"
                            value={branchForm.hours_text}
                            onChange={(event) =>
                                setBranchForm((prev) => ({
                                    ...prev,
                                    hours_text: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <label className="toggle">
                        <input
                            type="checkbox"
                            checked={branchForm.is_active}
                            onChange={(event) =>
                                setBranchForm((prev) => ({
                                    ...prev,
                                    is_active: event.target.checked,
                                }))
                            }
                        />
                        Activa
                    </label>
                    <div className="form-actions">
                        <button className="primary" type="submit">
                            Guardar
                        </button>
                    </div>
                </form>
            </div>

            {/* Servicios Panel */}
            <div className="panel">
                <div className="panel-title">Servicios</div>
                <div className="table">
                    <div className="table-head">
                        <span>Servicio</span>
                        <span>Precio</span>
                        <span>Estado</span>
                        <span>Accion</span>
                    </div>
                    {services.map((service) => (
                        <div className="table-row" key={service.id}>
                            <span>{service.name}</span>
                            <span>Bs {service.price_bob}</span>
                            <span>{service.is_active ? "Activo" : "Inactivo"}</span>
                            <div className="row-actions">
                                <button
                                    className="ghost"
                                    onClick={() =>
                                        setServiceForm({
                                            id: service.id,
                                            code: service.code,
                                            name: service.name,
                                            subtitle: service.subtitle || "",
                                            description: service.description,
                                            price_bob: service.price_bob,
                                            duration_min: service.duration_min || "",
                                            image_url: service.image_url || "",
                                            is_featured: service.is_featured,
                                            is_active: service.is_active,
                                        })
                                    }
                                >
                                    Editar
                                </button>
                                <button
                                    className="danger"
                                    onClick={() => handleServiceDisable(service.id)}
                                >
                                    Desactivar
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="panel-title">
                    {serviceForm.id ? "Editar servicio" : "Crear servicio"}
                </div>
                <form className="form-grid" onSubmit={handleServiceSubmit}>
                    <label className="field">
                        <span>Codigo</span>
                        <input
                            type="text"
                            value={serviceForm.code}
                            onChange={(event) =>
                                setServiceForm((prev) => ({
                                    ...prev,
                                    code: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <label className="field">
                        <span>Nombre</span>
                        <input
                            type="text"
                            value={serviceForm.name}
                            onChange={(event) =>
                                setServiceForm((prev) => ({
                                    ...prev,
                                    name: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <label className="field">
                        <span>Subtitulo</span>
                        <input
                            type="text"
                            value={serviceForm.subtitle}
                            onChange={(event) =>
                                setServiceForm((prev) => ({
                                    ...prev,
                                    subtitle: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <label className="field">
                        <span>Descripcion</span>
                        <textarea
                            rows="3"
                            value={serviceForm.description}
                            onChange={(event) =>
                                setServiceForm((prev) => ({
                                    ...prev,
                                    description: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <label className="field">
                        <span>Precio (Bs)</span>
                        <input
                            type="number"
                            value={serviceForm.price_bob}
                            onChange={(event) =>
                                setServiceForm((prev) => ({
                                    ...prev,
                                    price_bob: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <label className="field">
                        <span>Duracion (min)</span>
                        <input
                            type="number"
                            value={serviceForm.duration_min}
                            onChange={(event) =>
                                setServiceForm((prev) => ({
                                    ...prev,
                                    duration_min: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <label className="field">
                        <span>Imagen URL</span>
                        <input
                            type="text"
                            value={serviceForm.image_url}
                            onChange={(event) =>
                                setServiceForm((prev) => ({
                                    ...prev,
                                    image_url: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <label className="toggle">
                        <input
                            type="checkbox"
                            checked={serviceForm.is_featured}
                            onChange={(event) =>
                                setServiceForm((prev) => ({
                                    ...prev,
                                    is_featured: event.target.checked,
                                }))
                            }
                        />
                        Destacado
                    </label>
                    <label className="toggle">
                        <input
                            type="checkbox"
                            checked={serviceForm.is_active}
                            onChange={(event) =>
                                setServiceForm((prev) => ({
                                    ...prev,
                                    is_active: event.target.checked,
                                }))
                            }
                        />
                        Activo
                    </label>
                    {serviceForm.id && (
                        <div className="field">
                            <span>Disponibilidad por sucursal</span>
                            <div className="chip-grid">
                                {branches.map((branch) => {
                                    const mapping = services
                                        .find((item) => item.id === serviceForm.id)
                                        ?.branches?.find((entry) => {
                                            const branchId = entry.branch?.id || entry.branch_id;
                                            return branchId === branch.id;
                                        });
                                    const available = mapping?.is_available || false;
                                    return (
                                        <label className="chip" key={branch.id}>
                                            <input
                                                type="checkbox"
                                                checked={available}
                                                onChange={(event) =>
                                                    handleServiceBranchToggle(
                                                        services.find((item) => item.id === serviceForm.id),
                                                        branch.id,
                                                        event.target.checked
                                                    )
                                                }
                                            />
                                            {branch.name}
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    <div className="form-actions">
                        <button className="primary" type="submit">
                            Guardar
                        </button>
                    </div>
                </form>
            </div>

            {/* WhatsApp Lines Panel */}
            <div className="panel">
                <div className="panel-title">Lineas de WhatsApp</div>
                <div className="table">
                    <div className="table-head">
                        <span>Nombre</span>
                        <span>Phone ID</span>
                        <span>Accion</span>
                    </div>
                    {(tenantChannels || []).map((channel) => (
                        <div className="table-row" key={channel.id}>
                            <span>{channel.display_name || "Linea sin nombre"}</span>
                            <span>{channel.phone_number_id}</span>
                            <button
                                className="ghost"
                                onClick={() => handleChannelSelect(channel)}
                            >
                                Renombrar
                            </button>
                        </div>
                    ))}
                    {!tenantChannels?.length && (
                        <div className="empty-state">Sin lineas registradas</div>
                    )}
                </div>
                <div className="panel-title">
                    {channelForm.id ? "Editar linea" : "Selecciona una linea"}
                </div>
                <form className="form-grid" onSubmit={handleChannelSubmit}>
                    <label className="field">
                        <span>Nombre visible</span>
                        <input
                            type="text"
                            value={channelForm.display_name}
                            onChange={(event) =>
                                setChannelForm((prev) => ({
                                    ...prev,
                                    display_name: event.target.value,
                                }))
                            }
                            disabled={!channelForm.id}
                        />
                    </label>
                    <div className="form-actions">
                        <button className="primary" type="submit" disabled={!channelForm.id}>
                            Guardar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default GeneralSection;
