import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, setToken as persistToken } from "./api";
import { connectSocket } from "./socket";

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "open", label: "Open" },
  { value: "pending", label: "Pending" },
  { value: "closed", label: "Closed" },
];

function formatTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("es-BO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sortConversations(list) {
  return [...list].sort((a, b) => {
    const aTime = new Date(a.last_message_at || a.created_at).getTime();
    const bTime = new Date(b.last_message_at || b.created_at).getTime();
    return bTime - aTime;
  });
}

function upsertConversation(list, conversation) {
  const next = list.map((item) => (item.id === conversation.id ? conversation : item));
  if (!next.find((item) => item.id === conversation.id)) {
    next.push(conversation);
  }
  return sortConversations(next);
}

function upsertMessage(list, message) {
  if (!message) {
    return list;
  }
  if (list.some((item) => item.id === message.id)) {
    return list;
  }
  return [...list, message];
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(null);
  const [loginError, setLoginError] = useState("");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [filters, setFilters] = useState({
    status: "",
    assigned_user_id: "",
    tag: "",
    search: "",
  });
  const [users, setUsers] = useState([]);
  const [tags, setTags] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [noteMode, setNoteMode] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  useEffect(() => {
    if (!token) {
      persistToken("");
      return;
    }
    persistToken(token);
    void bootstrap();
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    const socket = connectSocket(token);
    socket.on("message:new", ({ conversation, message }) => {
      if (conversation) {
        setConversations((prev) => upsertConversation(prev, conversation));
        if (conversation.id === activeId) {
          setActiveConversation(conversation);
        }
      }
      if (message && message.conversation_id === activeId) {
        setMessages((prev) => upsertMessage(prev, message));
      }
    });
    socket.on("conversation:update", ({ conversation }) => {
      if (conversation) {
        setConversations((prev) => upsertConversation(prev, conversation));
        if (conversation.id === activeId) {
          setActiveConversation(conversation);
        }
      }
    });
    return () => {
      socket.disconnect();
    };
  }, [token, activeId]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadConversations();
  }, [filters, token]);

  async function bootstrap() {
    try {
      const me = await apiGet("/api/me");
      setUser(me.user);
    } catch (error) {
      handleLogout();
      return;
    }
    try {
      const [userData, tagData] = await Promise.all([
        apiGet("/api/users"),
        apiGet("/api/tags"),
      ]);
      setUsers(userData.users || []);
      setTags(tagData.tags || []);
    } catch (error) {
      setUsers([]);
      setTags([]);
    }
  }

  async function loadConversations() {
    setLoadingConversations(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) {
        params.set("status", filters.status);
      }
      if (filters.assigned_user_id) {
        params.set("assigned_user_id", filters.assigned_user_id);
      }
      if (filters.tag) {
        params.set("tag", filters.tag);
      }
      if (filters.search) {
        params.set("search", filters.search);
      }
      const query = params.toString();
      const data = await apiGet(`/api/conversations${query ? `?${query}` : ""}`);
      setConversations(sortConversations(data.conversations || []));
    } catch (error) {
      setConversations([]);
    } finally {
      setLoadingConversations(false);
    }
  }

  async function loadConversationDetail(conversationId) {
    setLoadingMessages(true);
    try {
      const data = await apiGet(`/api/conversations/${conversationId}`);
      setActiveConversation(data.conversation);
      setMessages(data.messages || []);
    } catch (error) {
      setActiveConversation(null);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError("");
    try {
      const data = await apiPost("/api/auth/login", loginForm);
      setToken(data.token);
      setUser(data.user);
      setLoginForm({ email: "", password: "" });
    } catch (error) {
      setLoginError("Credenciales invalidas");
    }
  }

  function handleLogout() {
    setToken("");
    setUser(null);
    setConversations([]);
    setActiveId("");
    setActiveConversation(null);
    setMessages([]);
    persistToken("");
  }

  async function handleSelectConversation(conversation) {
    setActiveId(conversation.id);
    setActiveConversation(conversation);
    await loadConversationDetail(conversation.id);
  }

  async function handleAssignSelf() {
    if (!activeConversation) {
      return;
    }
    await apiPost(`/api/conversations/${activeConversation.id}/assign`, {});
  }

  async function handleStatusChange(status) {
    if (!activeConversation) {
      return;
    }
    await apiPost(`/api/conversations/${activeConversation.id}/status`, { status });
  }

  async function handleSendMessage(event) {
    event.preventDefault();
    if (!activeConversation || !messageText.trim()) {
      return;
    }
    const payload = {
      text: messageText.trim(),
      type: noteMode ? "note" : "text",
    };
    await apiPost(`/api/conversations/${activeConversation.id}/messages`, payload);
    setMessageText("");
    if (noteMode) {
      setNoteMode(false);
    }
  }

  async function handleAddTag(event) {
    event.preventDefault();
    const name = newTag.trim();
    if (!name || !activeConversation) {
      return;
    }
    await apiPost(`/api/conversations/${activeConversation.id}/tags`, {
      add: [name],
    });
    setNewTag("");
    const updated = await apiGet("/api/tags");
    setTags(updated.tags || []);
  }

  async function handleToggleTag(name, hasTag) {
    if (!activeConversation) {
      return;
    }
    await apiPost(`/api/conversations/${activeConversation.id}/tags`, {
      add: hasTag ? [] : [name],
      remove: hasTag ? [name] : [],
    });
  }

  const selectedTags = useMemo(() => {
    if (!activeConversation) {
      return new Set();
    }
    return new Set((activeConversation.tags || []).map((tag) => tag.name));
  }, [activeConversation]);

  if (!token) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="login-title">Podopie OS</div>
          <p className="login-subtitle">Acceso a bandeja multiusuario</p>
          <form onSubmit={handleLogin} className="login-form">
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={loginForm.email}
                onChange={(event) =>
                  setLoginForm((prev) => ({ ...prev, email: event.target.value }))
                }
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) =>
                  setLoginForm((prev) => ({
                    ...prev,
                    password: event.target.value,
                  }))
                }
                required
              />
            </label>
            {loginError ? <div className="error">{loginError}</div> : null}
            <button className="primary" type="submit">
              Entrar
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div>
            <span className="brand-title">Podopie OS</span>
            <span className="brand-sub">Inbox en tiempo real</span>
          </div>
          <button className="ghost" onClick={handleLogout}>
            Salir
          </button>
        </div>
        <div className="filters">
          <div className="field compact">
            <span>Status</span>
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, status: event.target.value }))
              }
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field compact">
            <span>Asignado</span>
            <select
              value={filters.assigned_user_id}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  assigned_user_id: event.target.value,
                }))
              }
            >
              <option value="">Todos</option>
              <option value="unassigned">Sin asignar</option>
              {users.map((operator) => (
                <option key={operator.id} value={operator.id}>
                  {operator.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field compact">
            <span>Tag</span>
            <select
              value={filters.tag}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, tag: event.target.value }))
              }
            >
              <option value="">Todos</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.name}>
                  {tag.name}
                </option>
              ))}
            </select>
          </div>
          <label className="field compact">
            <span>Buscar</span>
            <input
              type="text"
              value={filters.search}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, search: event.target.value }))
              }
              placeholder="Telefono o nombre"
            />
          </label>
        </div>
        <div className="list-header">
          <span>Conversaciones</span>
          <button className="ghost" onClick={loadConversations}>
            {loadingConversations ? "..." : "Actualizar"}
          </button>
        </div>
        <div className="conversation-list">
          {conversations.length === 0 ? (
            <div className="empty">Sin conversaciones</div>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                className={`conversation-item ${
                  conversation.id === activeId ? "active" : ""
                }`}
                onClick={() => handleSelectConversation(conversation)}
              >
                <div className="row">
                  <span className="name">
                    {conversation.display_name || conversation.phone_e164}
                  </span>
                  <span className="time">
                    {formatTime(conversation.last_message_at)}
                  </span>
                </div>
                <div className="row subtle">
                  <span>{conversation.phone_e164}</span>
                  <span className={`status ${conversation.status}`}>
                    {conversation.status}
                  </span>
                </div>
                <div className="row subtle">
                  <span>
                    {conversation.assigned_user?.name || "Sin asignar"}
                  </span>
                  {conversation.status === "pending" &&
                  !conversation.assigned_user_id ? (
                    <span className="badge">Pending</span>
                  ) : null}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>
      <main className="chat">
        {!activeConversation ? (
          <div className="empty-state">Selecciona una conversacion</div>
        ) : (
          <>
            <div className="chat-header">
              <div>
                <div className="chat-title">
                  {activeConversation.display_name || activeConversation.phone_e164}
                </div>
                <div className="chat-sub">
                  {activeConversation.phone_e164} ·{" "}
                  <span className={`status ${activeConversation.status}`}>
                    {activeConversation.status}
                  </span>
                </div>
              </div>
              <div className="chat-actions">
                <button className="ghost" onClick={handleAssignSelf}>
                  Tomar conversacion
                </button>
                <button className="ghost" onClick={() => handleStatusChange("open")}>
                  Reactivar bot
                </button>
                <button
                  className="ghost"
                  onClick={() => handleStatusChange("pending")}
                >
                  Marcar pendiente
                </button>
                <button
                  className="danger"
                  onClick={() => handleStatusChange("closed")}
                >
                  Cerrar
                </button>
              </div>
            </div>
            <div className="chat-body">
              {loadingMessages ? (
                <div className="empty">Cargando mensajes...</div>
              ) : messages.length === 0 ? (
                <div className="empty">No hay mensajes</div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message ${message.direction} ${
                      message.type === "note" ? "note" : ""
                    }`}
                  >
                    <div className="message-text">{message.text || "[sin texto]"}</div>
                    <div className="message-meta">
                      {message.type === "note" ? "Nota interna" : message.type} ·{" "}
                      {formatTime(message.created_at)}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="chat-aside">
              <div className="panel">
                <div className="panel-title">Tags</div>
                <div className="tag-list">
                  {tags.map((tag) => {
                    const hasTag = selectedTags.has(tag.name);
                    return (
                      <button
                        key={tag.id}
                        className={`tag ${hasTag ? "active" : ""}`}
                        style={{ borderColor: tag.color || "#c4b8a3" }}
                        onClick={() => handleToggleTag(tag.name, hasTag)}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
                <form onSubmit={handleAddTag} className="tag-form">
                  <input
                    type="text"
                    placeholder="Agregar tag"
                    value={newTag}
                    onChange={(event) => setNewTag(event.target.value)}
                  />
                  <button className="ghost" type="submit">
                    Agregar
                  </button>
                </form>
              </div>
              <div className="panel">
                <div className="panel-title">Asignacion</div>
                <div className="panel-row">
                  <span>Operador</span>
                  <span>
                    {activeConversation.assigned_user?.name || "Sin asignar"}
                  </span>
                </div>
                {activeConversation.status === "pending" &&
                !activeConversation.assigned_user_id ? (
                  <div className="badge wide">Pending sin asignar</div>
                ) : null}
              </div>
            </div>
            <form className="composer" onSubmit={handleSendMessage}>
              <label className="field grow">
                <span>Respuesta</span>
                <input
                  type="text"
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder="Escribir mensaje"
                />
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={noteMode}
                  onChange={(event) => setNoteMode(event.target.checked)}
                />
                <span>Nota interna</span>
              </label>
              <button className="primary" type="submit">
                Enviar
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
