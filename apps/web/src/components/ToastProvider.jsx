import React, { createContext, useContext, useRef, useState } from "react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  };

  const pushToast = ({
    message,
    type = "success",
    actionLabel,
    onAction,
    duration = 6000,
  }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [
      ...prev,
      { id, message, type, actionLabel, onAction, duration },
    ]);
    if (duration > 0) {
      const timer = setTimeout(() => removeToast(id), duration);
      timersRef.current.set(id, timer);
    }
    return id;
  };

  const renderIcon = (type) => {
    if (type === "error") {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 4.5c.5 0 .95.26 1.2.68l6.5 11.25a1.35 1.35 0 0 1-1.2 2.02H5.5a1.35 1.35 0 0 1-1.2-2.02L10.8 5.18c.25-.42.7-.68 1.2-.68Zm0 4.25a.9.9 0 0 0-.9.9v5.5a.9.9 0 1 0 1.8 0v-5.5a.9.9 0 0 0-.9-.9Zm0 8.3a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z"
            fill="currentColor"
          />
        </svg>
      );
    }
    if (type === "info") {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17Zm0 3.9a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Zm-1.2 4.2h2.4v6.1h-2.4v-6.1Z"
            fill="currentColor"
          />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M9.5 16.6 5.6 12.7a1 1 0 1 1 1.4-1.4l2.5 2.5 7.5-7.5a1 1 0 1 1 1.4 1.4l-8.9 8.9a1 1 0 0 1-1.4 0Z"
          fill="currentColor"
        />
      </svg>
    );
  };

  return (
    <ToastContext.Provider value={{ pushToast, removeToast }}>
      {children}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}`}
            style={{ "--toast-duration": `${toast.duration}ms` }}
          >
            <div className="toast-icon">{renderIcon(toast.type)}</div>
            <div className="toast-message">{toast.message}</div>
            {toast.actionLabel && (
              <button
                className="toast-action"
                type="button"
                onClick={() => {
                  if (toast.onAction) {
                    Promise.resolve(toast.onAction()).catch(() => undefined);
                  }
                  removeToast(toast.id);
                }}
              >
                {toast.actionLabel}
              </button>
            )}
            <button
              className="toast-close"
              type="button"
              onClick={() => removeToast(toast.id)}
            >
              x
            </button>
            {toast.duration > 0 && (
              <div className={`toast-progress toast-progress-${toast.type}`} />
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
