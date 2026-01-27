/**
 * TemplatesSection - Plantillas de Meta/WhatsApp
 */
import React from "react";

function TemplatesSection({
    templates,
    templateForm,
    setTemplateForm,
    handleTemplateSubmit,
    handleSyncTemplates,
}) {
    return (
        <div className="page-grid">
            <div className="panel">
                <div className="panel-title">Templates</div>
                <button className="ghost" onClick={handleSyncTemplates}>
                    Sincronizar WhatsApp
                </button>
                <div className="table">
                    <div className="table-head">
                        <span>Nombre</span>
                        <span>Lang</span>
                        <span>Estado</span>
                        <span>Accion</span>
                    </div>
                    {templates.map((template) => (
                        <div className="table-row" key={template.id}>
                            <span>{template.name}</span>
                            <span>{template.language}</span>
                            <span>{template.is_active ? "Activo" : "Inactivo"}</span>
                            <button
                                className="ghost"
                                onClick={() =>
                                    setTemplateForm({
                                        id: template.id,
                                        name: template.name,
                                        language: template.language,
                                        category: template.category || "",
                                        body_preview: template.body_preview,
                                        is_active: template.is_active,
                                    })
                                }
                            >
                                Editar
                            </button>
                        </div>
                    ))}
                </div>
            </div>
            <div className="panel">
                <div className="panel-title">
                    {templateForm.id ? "Editar template" : "Crear template"}
                </div>
                <form className="form-grid" onSubmit={handleTemplateSubmit}>
                    <label className="field">
                        <span>Nombre</span>
                        <input
                            type="text"
                            value={templateForm.name}
                            onChange={(event) =>
                                setTemplateForm((prev) => ({
                                    ...prev,
                                    name: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <label className="field">
                        <span>Idioma</span>
                        <input
                            type="text"
                            value={templateForm.language}
                            onChange={(event) =>
                                setTemplateForm((prev) => ({
                                    ...prev,
                                    language: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <label className="field">
                        <span>Categoria</span>
                        <input
                            type="text"
                            value={templateForm.category}
                            onChange={(event) =>
                                setTemplateForm((prev) => ({
                                    ...prev,
                                    category: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <label className="field">
                        <span>Preview</span>
                        <textarea
                            rows="4"
                            value={templateForm.body_preview}
                            onChange={(event) =>
                                setTemplateForm((prev) => ({
                                    ...prev,
                                    body_preview: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <label className="toggle">
                        <input
                            type="checkbox"
                            checked={templateForm.is_active}
                            onChange={(event) =>
                                setTemplateForm((prev) => ({
                                    ...prev,
                                    is_active: event.target.checked,
                                }))
                            }
                        />
                        Activo
                    </label>
                    <div className="form-actions">
                        <button className="primary" type="submit">
                            Guardar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default TemplatesSection;
