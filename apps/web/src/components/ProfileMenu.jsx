import React from "react";

function ProfileMenu({ user, isOpen, onToggle, onLogout, getInitial }) {
  return (
    <div className="rail-profile">
      <button
        className={`profile-button ${isOpen ? "active" : ""}`}
        type="button"
        onClick={onToggle}
        title="Perfil"
        aria-label="Perfil"
      >
        <span>{getInitial(user.name)}</span>
      </button>
      {isOpen && (
        <div className="profile-card">
          <div className="profile-title">{user.name}</div>
          <div className="profile-meta">{user.email || "Sin correo"}</div>
          <div className="profile-role">{user.role}</div>
          <button className="primary" type="button" onClick={onLogout}>
            Salir
          </button>
        </div>
      )}
    </div>
  );
}

export default ProfileMenu;
