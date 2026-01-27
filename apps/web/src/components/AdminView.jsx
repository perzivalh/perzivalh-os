/**
 * AdminView - Vista principal de administración
 * Refactorizado para usar componentes modulares
 */
import React from "react";

// Importar componentes de sección
import UsersSection from "./admin/UsersSection";
import GeneralSection from "./admin/GeneralSection";
import BotSection from "./admin/BotSection";
import TemplatesSection from "./admin/TemplatesSection";
import AuditSection from "./admin/AuditSection";
import OdooSection from "./admin/OdooSection";

// Importar iconos y constantes
import {
  SlidersIcon,
  UsersIcon,
  BotIcon,
  TemplateIcon,
  AuditIcon,
  PuzzleIcon,
} from "./admin/icons";

function AdminView({
  settingsSection,
  setSettingsSection,
  settingsTab,
  setSettingsTab,
  rolePermissions,
  setRolePermissions,
  currentRole,
  isAdmin,
  adminUsers,
  userForm,
  setUserForm,
  roleOptions,
  handleUserSubmit,
  settings,
  setSettings,
  handleSaveSettings,
  branches,
  services,
  branchForm,
  setBranchForm,
  handleBranchSubmit,
  handleBranchDisable,
  serviceForm,
  setServiceForm,
  handleServiceSubmit,
  handleServiceDisable,
  handleServiceBranchToggle,
  templates,
  templateForm,
  setTemplateForm,
  handleTemplateSubmit,
  handleSyncTemplates,
  auditLogs,
  formatDate,
  planName,
  tenantChannels,
  channelForm,
  setChannelForm,
  handleChannelSelect,
  handleChannelSubmit,
  handleUserDelete,
  defaultRolePermissions,
  handleRoleDelete,
  useShellLayout = false,
  pageError,
}) {
  const roleAccess = rolePermissions?.[currentRole];

  const settingsMenu = [
    {
      title: "Principal",
      items: [
        { id: "general", label: "General", icon: SlidersIcon },
        { id: "users", label: "Gestion de Usuarios", icon: UsersIcon },
        { id: "bot", label: "Configuracion de Bot", icon: BotIcon },
      ],
    },
    {
      title: "Canales e Integraciones",
      items: [
        { id: "templates", label: "Plantillas de Meta", icon: TemplateIcon },
        { id: "audit", label: "Registros / Auditoria", icon: AuditIcon },
        { id: "odoo", label: "Integracion Odoo", icon: PuzzleIcon },
      ],
    },
  ];

  function hasSettingsAccess(section) {
    return Boolean(roleAccess?.settings?.[section]?.read);
  }

  function handleSectionClick(section) {
    if (!hasSettingsAccess(section)) {
      return;
    }
    setSettingsSection(section);
  }

  const content = (
    <>
      <aside className="settings-sidebar">
        <div className="settings-header">
          <div className="settings-title">CONFIGURACION</div>
          <div className="settings-version">PODOPIE OS V2.0</div>
        </div>
        {settingsMenu.map((group) => (
          <div className="settings-group" key={group.title}>
            <div className="settings-group-title">{group.title}</div>
            <div className="settings-group-list">
              {group.items.map((item) => {
                const disabled = !hasSettingsAccess(item.id);
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    className={`settings-item ${settingsSection === item.id ? "active" : ""
                      }`}
                    type="button"
                    onClick={() => handleSectionClick(item.id)}
                    disabled={disabled}
                  >
                    <span className="settings-icon" aria-hidden="true">
                      <Icon className="settings-icon-svg" />
                    </span>
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div className="settings-plan">
          <div className="settings-plan-label">Plan actual</div>
          <div className="settings-plan-name">
            {planName ? planName : "Sin plan"}
          </div>
        </div>
      </aside>

      <div className="settings-content">
        {settingsSection === "users" && (
          <UsersSection
            settingsTab={settingsTab}
            setSettingsTab={setSettingsTab}
            rolePermissions={rolePermissions}
            setRolePermissions={setRolePermissions}
            isAdmin={isAdmin}
            adminUsers={adminUsers}
            userForm={userForm}
            setUserForm={setUserForm}
            roleOptions={roleOptions}
            handleUserSubmit={handleUserSubmit}
            handleUserDelete={handleUserDelete}
            defaultRolePermissions={defaultRolePermissions}
            handleRoleDelete={handleRoleDelete}
          />
        )}

        {settingsSection === "general" && (
          <GeneralSection
            branches={branches}
            branchForm={branchForm}
            setBranchForm={setBranchForm}
            handleBranchSubmit={handleBranchSubmit}
            handleBranchDisable={handleBranchDisable}
            services={services}
            serviceForm={serviceForm}
            setServiceForm={setServiceForm}
            handleServiceSubmit={handleServiceSubmit}
            handleServiceDisable={handleServiceDisable}
            handleServiceBranchToggle={handleServiceBranchToggle}
            tenantChannels={tenantChannels}
            channelForm={channelForm}
            setChannelForm={setChannelForm}
            handleChannelSelect={handleChannelSelect}
            handleChannelSubmit={handleChannelSubmit}
          />
        )}

        {settingsSection === "bot" && (
          <BotSection
            settings={settings}
            setSettings={setSettings}
            handleSaveSettings={handleSaveSettings}
          />
        )}

        {settingsSection === "templates" && (
          <TemplatesSection
            templates={templates}
            templateForm={templateForm}
            setTemplateForm={setTemplateForm}
            handleTemplateSubmit={handleTemplateSubmit}
            handleSyncTemplates={handleSyncTemplates}
          />
        )}

        {settingsSection === "audit" && (
          <AuditSection
            auditLogs={auditLogs}
            formatDate={formatDate}
          />
        )}

        {settingsSection === "odoo" && <OdooSection />}

        {pageError && <div className="error-banner">{pageError}</div>}
      </div>
    </>
  );

  if (useShellLayout) {
    return content;
  }

  return <section className="settings-layout">{content}</section>;
}

export default AdminView;
