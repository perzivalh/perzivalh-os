import React from "react";

function ChatView({
  activeConversation,
  conversations,
  filters,
  showFilters,
  users,
  tags,
  statusOptions,
  statusLabels,
  formatListTime,
  formatCompactDate,
  messageBlocks,
  messageDraft,
  messageMode,
  quickActions,
  tagInput,
  latestNote,
  loadingConversation,
  isInfoOpen,
  hasUnread,
  activeName,
  activePhone,
  activeStatusLabel,
  canManageStatus,
  messageInputRef,
  chatBodyRef,
  setShowFilters,
  setFilters,
  loadConversation,
  handleBackToList,
  setIsInfoOpen,
  handleChatScroll,
  handleAssignSelf,
  handleStatusChange,
  handleToggleTag,
  handleAddTag,
  handleQuickAction,
  handleSendMessage,
  setMessageMode,
  setMessageDraft,
  scrollChatToBottom,
  getInitial,
  PlusIcon,
  SearchIcon,
  VideoIcon,
  PhoneIcon,
  InfoIcon,
  SendIcon,
}) {
  return (
    <section className={`chat-shell ${activeConversation ? "has-active" : ""}`}>
      <aside className="chat-list-panel">
        <div className="chat-list-header">
          <div>
            <div className="list-title">PODOPIE</div>
            <div className="list-subtitle">Chats</div>
          </div>
          <button className="icon-button add-chat" type="button" title="Nuevo chat">
            <PlusIcon className="icon" />
          </button>
        </div>

        <div className="chat-search">
          <SearchIcon className="search-icon" />
          <input
            type="text"
            placeholder="Buscar pacientes o mensajes"
            value={filters.search}
            onFocus={() => setShowFilters(true)}
            onClick={() => setShowFilters(true)}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, search: event.target.value }))
            }
          />
          {showFilters && (
            <button
              className="search-close"
              type="button"
              onClick={() => setShowFilters(false)}
              aria-label="Cerrar filtros"
            >
              x
            </button>
          )}
        </div>

        {showFilters && (
          <div className="chat-filters">
            <label className="filter-field">
              <span>Status</span>
              <select
                value={filters.status}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    status: event.target.value,
                  }))
                }
              >
                <option value="">Todos</option>
                {statusOptions.map((status) => (
                  <option value={status} key={status}>
                    {statusLabels[status] || status}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
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
                {users.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>Tags</span>
              <select
                value={filters.tag}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, tag: event.target.value }))
                }
              >
                <option value="">Todos</option>
                {tags.map((tag) => (
                  <option value={tag.name} key={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="list-header">
          <span>Conversaciones</span>
          <span>{conversations.length}</span>
        </div>

        <div className="conversation-list">
          {conversations.map((conversation, index) => {
            const active = activeConversation?.id === conversation.id;
            const pendingUnassigned =
              conversation.status === "pending" &&
              !conversation.assigned_user_id;
            const displayName =
              conversation.display_name ||
              conversation.phone_e164 ||
              conversation.wa_id ||
              "Sin nombre";
            const preview =
              conversation.last_message_preview ||
              conversation.last_message_text ||
              conversation.last_message ||
              "Sin mensajes";
            const unreadCount = Number(
              conversation.unread_count ||
                conversation.unread_messages ||
                conversation.unread ||
                0
            );
            const topTag = conversation.tags?.[0]?.name || "";
            const statusLabel =
              statusLabels[conversation.status] || conversation.status;
            return (
              <button
                key={conversation.id}
                className={`conversation-item ${active ? "active" : ""}`}
                onClick={() => loadConversation(conversation.id)}
                style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
              >
                <div className="avatar">
                  <span>{getInitial(displayName)}</span>
                  {pendingUnassigned && <span className="presence-dot" />}
                </div>
                <div className="conversation-body">
                  <div className="conversation-row">
                    <span className="conversation-name">{displayName}</span>
                    <div className="conversation-right">
                      <span className="conversation-time">
                        {formatListTime(conversation.last_message_at)}
                      </span>
                      {unreadCount > 0 && (
                        <span className="conversation-unread">{unreadCount}</span>
                      )}
                    </div>
                  </div>
                  <div className="conversation-preview">{preview}</div>
                  <div className="conversation-meta">
                    <span className={`status-pill ${conversation.status}`}>
                      {statusLabel}
                    </span>
                    {topTag && (
                      <span className="status-pill tag-pill">{topTag}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <div className={`chat-view ${isInfoOpen ? "info-open" : "info-closed"}`}>
        <div className="chat-main">
          <div className="chat-card">
            <header className="chat-topbar">
              <div className="chat-title">
                {activeConversation && (
                  <button
                    className="back-button"
                    type="button"
                    onClick={handleBackToList}
                  >
                    Chats
                  </button>
                )}
                <div className="chat-avatar">
                  <span>{getInitial(activeName)}</span>
                </div>
                <div>
                  <div className="chat-name">{activeName}</div>
                  {activeConversation ? (
                    <div className="chat-status">
                      <span
                        className={`status-dot ${activeConversation.status}`}
                      />
                      {activeStatusLabel}
                    </div>
                  ) : (
                    <div className="chat-status muted">
                      Elige una conversacion
                    </div>
                  )}
                </div>
              </div>
              <div className="chat-actions">
                <button className="icon-button" type="button" title="Video">
                  <VideoIcon className="icon" />
                </button>
                <button className="icon-button" type="button" title="Llamar">
                  <PhoneIcon className="icon" />
                </button>
                <button className="icon-button" type="button" title="Buscar">
                  <SearchIcon className="icon" />
                </button>
                <button
                  className={`icon-button ${isInfoOpen ? "active" : ""}`}
                  type="button"
                  title="Info"
                  onClick={() => setIsInfoOpen((prev) => !prev)}
                >
                  <InfoIcon className="icon" />
                </button>
              </div>
            </header>

            <div className="chat-body" ref={chatBodyRef} onScroll={handleChatScroll}>
              {loadingConversation && <div className="empty">Cargando...</div>}
              {!loadingConversation && !activeConversation && (
                <div className="empty">Selecciona una conversacion</div>
              )}
              {!loadingConversation && activeConversation && (
                <>
                  {messageBlocks.length ? (
                    messageBlocks
                  ) : (
                    <div className="empty-state">Sin mensajes</div>
                  )}
                  <div className="chat-encryption">
                    Los mensajes estan cifrados de extremo a extremo.
                  </div>
                </>
              )}
            </div>

            {hasUnread && (
              <button
                className="new-message-banner"
                type="button"
                onClick={scrollChatToBottom}
              >
                Nuevos mensajes
              </button>
            )}

            <form className="chat-composer" onSubmit={handleSendMessage}>
              <div className="quick-actions">
                {quickActions.map((action) => (
                  <button
                    key={action}
                    className="quick-action"
                    type="button"
                    onClick={() => handleQuickAction(action)}
                  >
                    {action}
                  </button>
                ))}
              </div>
              <div className="composer-row">
                <select
                  className="message-mode"
                  value={messageMode}
                  onChange={(event) => setMessageMode(event.target.value)}
                >
                  <option value="text">WhatsApp</option>
                  <option value="note">Nota interna</option>
                </select>
                <input
                  ref={messageInputRef}
                  type="text"
                  placeholder="Escribe un mensaje..."
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                />
                <button className="send-button" type="submit">
                  <SendIcon className="icon" />
                </button>
              </div>
            </form>
          </div>
        </div>

        <aside className="chat-info">
          <div className="info-card">
            <div className="info-avatar">
              <span>{getInitial(activeName)}</span>
            </div>
            <div className="info-name">{activeName}</div>
            <div className="info-phone">{activePhone || "Sin telefono"}</div>
            <button className="primary" type="button">
              Abrir en Odoo
            </button>
          </div>

          <div className="info-section">
            <div className="section-title">Informacion del paciente</div>
            <div className="info-row">
              <span>Ultima visita</span>
              <span>
                {formatCompactDate(
                  activeConversation?.last_visit_at ||
                    activeConversation?.last_visit
                )}
              </span>
            </div>
            <div className="info-row">
              <span>Tratamiento actual</span>
              <span>
                {activeConversation?.current_treatment ||
                  activeConversation?.treatment ||
                  "-"}
              </span>
            </div>
            <div className="info-row">
              <span>Alergias</span>
              <span>{activeConversation?.allergies || "Ninguna reportada"}</span>
            </div>
          </div>

          <div className="info-section">
            <div className="section-header">
              <div className="section-title">Etiquetas</div>
              <button className="link-button" type="button">
                Gestionar
              </button>
            </div>
            <div className="tag-list">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  className={`tag ${
                    activeConversation?.tags?.some(
                      (item) => item.name === tag.name
                    )
                      ? "active"
                      : ""
                  }`}
                  onClick={() => handleToggleTag(tag.name)}
                >
                  {tag.name}
                </button>
              ))}
            </div>
            <form className="tag-form" onSubmit={handleAddTag}>
              <input
                type="text"
                placeholder="Anadir etiqueta..."
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
              />
              <button className="icon-button" type="submit" title="Agregar">
                <PlusIcon className="icon" />
              </button>
            </form>
          </div>

          <div className="info-section">
            <div className="section-title">Notas internas</div>
            {latestNote ? (
              <div className="note-card">{latestNote}</div>
            ) : (
              <div className="empty-state">Sin notas internas</div>
            )}
          </div>

          {activeConversation && (
            <div className="info-section">
              <div className="section-title">Acciones</div>
              <div className="action-stack">
                <button className="ghost" type="button" onClick={handleAssignSelf}>
                  Tomar conversacion
                </button>
                {canManageStatus && (
                  <>
                    <button
                      className="ghost"
                      type="button"
                      onClick={() => handleStatusChange("open")}
                    >
                      Reactivar bot
                    </button>
                    <button
                      className="ghost"
                      type="button"
                      onClick={() => handleStatusChange("pending")}
                    >
                      Marcar pendiente
                    </button>
                    <button
                      className="danger soft"
                      type="button"
                      onClick={() => handleStatusChange("closed")}
                    >
                      Cerrar conversacion
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

export default ChatView;
