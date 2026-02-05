import React from "react";

function NoticeBanner({
  variant = "error",
  title,
  message,
  actionLabel,
  onAction,
  dismissLabel = "Cerrar",
  onDismiss,
}) {
  const iconText = variant === "offline" ? "x" : "!";
  return (
    <div className={`notice-banner notice-banner-${variant}`}>
      <div className="notice-icon" aria-hidden="true">
        {iconText}
      </div>
      <div className="notice-content">
        {title ? <div className="notice-title">{title}</div> : null}
        <div className="notice-text">{message}</div>
      </div>
      <div className="notice-actions">
        {actionLabel && (
          <button className="notice-action" type="button" onClick={onAction}>
            {actionLabel}
          </button>
        )}
        {onDismiss && (
          <button className="notice-close" type="button" onClick={onDismiss}>
            {dismissLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export default NoticeBanner;
