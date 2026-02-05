import React from "react";
import ProfileMenu from "./ProfileMenu.jsx";

function NavRail({
  navItems,
  view,
  onSetView,
  theme,
  onToggleTheme,
  user,
  logoUrl,
  brandName,
  isProfileOpen,
  onToggleProfile,
  onLogout,
  onReturnToSuperadmin,
  showReturnToSuperadmin,
  getInitial,
  SunIcon,
  MoonIcon,
}) {
  const brandInitial = (brandName || "P").trim().charAt(0) || "P";
  return (
    <aside className="nav-rail">
      <button className="rail-logo" type="button" title={brandName || "Logo"}>
        {logoUrl ? (
          <img src={logoUrl} alt={brandName || "Logo"} />
        ) : (
          <span className="logo-mark">{brandInitial}</span>
        )}
      </button>
      <nav className="rail-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`rail-button ${view === item.id ? "active" : ""}`}
              onClick={() => item.enabled && onSetView(item.id)}
              title={item.label}
              aria-label={item.label}
              type="button"
              disabled={!item.enabled}
            >
              <Icon className="rail-icon" />
            </button>
          );
        })}
      </nav>
      <div className="rail-spacer" />
      <button
        className="rail-button"
        type="button"
        onClick={onToggleTheme}
        title={theme === "dark" ? "Tema claro" : "Tema oscuro"}
        aria-label={theme === "dark" ? "Tema claro" : "Tema oscuro"}
      >
        {theme === "dark" ? (
          <SunIcon className="rail-icon" />
        ) : (
          <MoonIcon className="rail-icon" />
        )}
      </button>
      <ProfileMenu
        user={user}
        isOpen={isProfileOpen}
        onToggle={onToggleProfile}
        onLogout={onLogout}
        onReturnToSuperadmin={onReturnToSuperadmin}
        showReturnToSuperadmin={showReturnToSuperadmin}
        getInitial={getInitial}
      />
    </aside>
  );
}

export default NavRail;
