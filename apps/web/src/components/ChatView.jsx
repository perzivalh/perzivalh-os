import React, { useEffect, useRef, useState } from "react";

function ChatView({
  activeConversation,
  conversations,
  conversationsLoading,
  conversationsLoadingMore,
  conversationsHasMore,
  conversationsPullRefreshing,
  channels,
  brandName,
  lastReadMap,
  filters,
  showFilters,
  users,
  tags,
  statusOptions,
  statusLabels,
  formatListTime,
  messageBlocks,
  messageDraft,
  messageMode,
  quickActions,
  tagInput,
  setTagInput,
  noteInput,
  notesList,
  latestNote,
  loadingConversation,
  isInfoOpen,
  hasUnread,
  scrollDayLabel,
  activeName,
  activePhone,
  activeStatusLabel,
  canManageStatus,
  currentUser,
  messageInputRef,
  chatBodyRef,
  setShowFilters,
  setFilters,
  loadConversation,
  onLoadMoreConversations,
  onRefreshConversations,
  handleBackToList,
  handleBackFromInfo,
  setIsInfoOpen,
  handleChatScroll,
  handleAssignSelf,
  handleStatusChange,
  handleToggleTag,
  handleAddTag,
  setNoteInput,
  handleAddNote,
  reassignUserId,
  setReassignUserId,
  handleReassignConversation,
  handleOpenTagManager,
  handleCloseTagManager,
  showTagManager,
  tagManagerForm,
  setTagManagerForm,
  handleCreateTag,
  handleDeleteTag,
  handleQuickAction,
  handleSendMessage,
  handleSendMedia,
  setMessageMode,
  setMessageDraft,
  scrollChatToBottom,
  getInitial,
  PlusIcon,
  SearchIcon,
  InfoIcon,
  SendIcon,
}) {
  const attachFileRef = useRef(null);
  const [attachPreview, setAttachPreview] = useState(null); // { file, type, objectUrl, caption }

  function handleAttachClick() {
    if (attachFileRef.current) {
      attachFileRef.current.value = "";
      attachFileRef.current.click();
    }
  }

  function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const mime = file.type;
    let type = "document";
    if (mime.startsWith("image/")) type = "image";
    else if (mime.startsWith("audio/")) type = "audio";
    else if (mime.startsWith("video/")) type = "video";
    const objectUrl = URL.createObjectURL(file);
    setAttachPreview({ file, type, objectUrl, caption: "" });
  }

  async function handleConfirmSend() {
    if (!attachPreview || !handleSendMedia) return;
    const preview = attachPreview;
    setAttachPreview(null);
    URL.revokeObjectURL(preview.objectUrl);
    await handleSendMedia({ file: preview.file, type: preview.type, caption: preview.caption });
  }

  function handleCancelAttach() {
    if (attachPreview) URL.revokeObjectURL(attachPreview.objectUrl);
    setAttachPreview(null);
  }
  const channelMap = new Map(
    (channels || []).map((channel) => [
      channel.phone_number_id,
      channel.display_name ||
        (channel.phone_number_id
          ? `Linea ${String(channel.phone_number_id).slice(-4)}`
          : ""),
    ])
  );
  const userMap = new Map((users || []).map((item) => [item.id, item]));
  const isAssignedToOther =
    activeConversation?.assigned_user_id &&
    activeConversation.assigned_user_id !== currentUser?.id;
  const mobilePane = !activeConversation
    ? "list"
    : isInfoOpen
      ? "info"
      : "chat";
  const conversationListRef = useRef(null);
  const pullStartYRef = useRef(0);
  const pullTrackingRef = useRef(false);
  const pullReadyRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [pullReady, setPullReady] = useState(false);
  const PULL_MAX = 96;
  const PULL_THRESHOLD = 56;

  const effectivePullDistance = conversationsPullRefreshing ? PULL_THRESHOLD : pullDistance;
  const pullLabel = conversationsPullRefreshing
    ? "Actualizando chats..."
    : pullReady
      ? "Suelta para actualizar"
      : "Desliza para recargar chats";

  useEffect(() => {
    if (
      !onLoadMoreConversations ||
      conversationsLoading ||
      conversationsLoadingMore ||
      conversationsPullRefreshing ||
      !conversationsHasMore
    ) {
      return;
    }
    const node = conversationListRef.current;
    if (!node) {
      return;
    }
    if (node.scrollHeight <= node.clientHeight + 24) {
      onLoadMoreConversations();
    }
  }, [
    conversations,
    conversationsLoading,
    conversationsHasMore,
    conversationsLoadingMore,
    conversationsPullRefreshing,
    onLoadMoreConversations,
  ]);

  function isMobileTouchContext() {
    if (typeof window === "undefined") {
      return false;
    }
    if (typeof window.matchMedia !== "function") {
      return true;
    }
    return window.matchMedia("(max-width: 900px)").matches;
  }

  function handleConversationListScroll(event) {
    const node = event.currentTarget;
    if (
      !node ||
      conversationsLoading ||
      conversationsLoadingMore ||
      conversationsPullRefreshing ||
      !conversationsHasMore
    ) {
      return;
    }
    const distanceToBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distanceToBottom < 180) {
      onLoadMoreConversations?.();
    }
  }

  function handleConversationTouchStart(event) {
    if (!onRefreshConversations || conversationsPullRefreshing || !isMobileTouchContext()) {
      return;
    }
    const node = conversationListRef.current;
    const touch = event.touches?.[0];
    if (!node || !touch || node.scrollTop > 0) {
      return;
    }
    pullTrackingRef.current = true;
    pullStartYRef.current = touch.clientY;
    pullReadyRef.current = false;
    setPullDistance(0);
    setPullReady(false);
  }

  function handleConversationTouchMove(event) {
    if (!pullTrackingRef.current || conversationsPullRefreshing) {
      return;
    }
    const node = conversationListRef.current;
    const touch = event.touches?.[0];
    if (!node || !touch) {
      return;
    }
    if (node.scrollTop > 0) {
      pullTrackingRef.current = false;
      pullReadyRef.current = false;
      setPullDistance(0);
      setPullReady(false);
      return;
    }
    const delta = touch.clientY - pullStartYRef.current;
    if (delta <= 0) {
      pullReadyRef.current = false;
      setPullDistance(0);
      setPullReady(false);
      return;
    }
    const distance = Math.min(PULL_MAX, Math.round(delta * 0.45));
    const ready = distance >= PULL_THRESHOLD;
    pullReadyRef.current = ready;
    setPullDistance(distance);
    setPullReady(ready);
    if (event.cancelable) {
      event.preventDefault();
    }
  }

  function handleConversationTouchEnd() {
    if (!pullTrackingRef.current) {
      return;
    }
    pullTrackingRef.current = false;
    const shouldRefresh = pullReadyRef.current && !conversationsPullRefreshing;
    pullReadyRef.current = false;
    setPullDistance(0);
    setPullReady(false);
    if (shouldRefresh) {
      onRefreshConversations?.();
    }
  }

  function getPreview(conversation) {
    if (!conversation) {
      return "Sin mensajes";
    }
    const preview =
      conversation.last_message_preview ||
      conversation.last_message_text ||
      conversation.last_message ||
      "";
    if (preview) {
      return preview;
    }
    if (conversation.last_message_type) {
      return `[${conversation.last_message_type}]`;
    }
    return "Sin mensajes";
  }

  return (
    <>
      <section
        className={`chat-shell ${activeConversation ? "has-active" : ""}`}
        data-mobile-pane={mobilePane}
      >
      <aside className="chat-list-panel">
        <div className="chat-list-header">
          <div>
            <div className="list-title">
              {(brandName || "Perzivalh").toUpperCase()}
            </div>
            <div className="list-subtitle">Chats</div>
          </div>
          <button className="icon-button add-chat" type="button" title="Nuevo chat">
            <PlusIcon className="icon" />
          </button>
        </div>

        <div className="chat-search ui-search">
          <SearchIcon className="search-icon ui-search-icon" />
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
          <select
            className="line-filter"
            value={filters.phone_number_id}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                phone_number_id: event.target.value,
              }))
            }
          >
            <option value="">Todas las lineas</option>
            {(channels || []).map((channel) => (
              <option key={channel.id} value={channel.phone_number_id}>
                {channel.display_name ||
                  `Linea ${String(channel.phone_number_id).slice(-4)}`}
              </option>
            ))}
          </select>
          <span>{conversations.length}</span>
        </div>

        <div className="conversation-list-wrapper">
          <div
            className={`conversation-pull-indicator ${(pullReady || conversationsPullRefreshing) ? "ready" : ""}`}
            style={{ height: `${effectivePullDistance}px` }}
            aria-hidden={effectivePullDistance <= 0}
          >
            <span>{pullLabel}</span>
          </div>
          <div
            className="conversation-list"
            ref={conversationListRef}
            onScroll={handleConversationListScroll}
            onTouchStart={handleConversationTouchStart}
            onTouchMove={handleConversationTouchMove}
            onTouchEnd={handleConversationTouchEnd}
            onTouchCancel={handleConversationTouchEnd}
          >
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
                getPreview(conversation);
              const unreadCount = Number(
                conversation.unread_count ||
                  conversation.unread_messages ||
                  conversation.unread ||
                  0
              );
              const topTag = conversation.tags?.[0]?.name || "";
              const assignedName =
                conversation.assigned_user?.name ||
                userMap.get(conversation.assigned_user_id || "")?.name ||
                "";
              const assignedLabel = assignedName ? `Tomada por ${assignedName}` : "";
              const lineLabel = conversation.phone_number_id
                ? channelMap.get(conversation.phone_number_id) ||
                  `Linea ${String(conversation.phone_number_id).slice(-4)}`
                : "";
              const lastReadAt = lastReadMap?.[conversation.id] || null;
              const lastMessageAt = conversation.last_message_at;
              const isUnread =
                lastMessageAt &&
                (!lastReadAt ||
                  new Date(lastMessageAt).getTime() > new Date(lastReadAt).getTime()) &&
                conversation.last_message_direction === "in";
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
                    <div className={`conversation-preview ${isUnread ? "unread" : ""}`}>
                      {preview}
                    </div>
                    <div className="conversation-meta">
                      {lineLabel && (
                        <span className="status-pill line-pill">{lineLabel}</span>
                      )}
                      {assignedLabel && (
                        <span className="status-pill assignee-pill">{assignedLabel}</span>
                      )}
                      {topTag && (
                        <span className="status-pill tag-pill">{topTag}</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            {conversationsLoading && conversations.length === 0 && (
              <div className="conversation-list-state">Cargando chats...</div>
            )}
            {!conversationsLoading && conversations.length === 0 && (
              <div className="conversation-list-state">
                No hay chats para los filtros seleccionados.
              </div>
            )}
            {conversationsLoadingMore && (
              <div className="conversation-list-state">Cargando mas chats...</div>
            )}
          </div>
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
                <div className="chat-title-copy">
                  <div className="chat-name">{activeName}</div>
                  {activeConversation ? (
                    <div className="chat-status">{activeStatusLabel}</div>
                  ) : (
                    <div className="chat-status muted">
                      Elige una conversacion
                    </div>
                  )}
                </div>
              </div>
              <div className="chat-actions">
                <button
                  className={`icon-button ${isInfoOpen ? "active" : ""}`}
                  type="button"
                  title="Info"
                  disabled={!activeConversation}
                  onClick={() => setIsInfoOpen((prev) => !prev)}
                >
                  <InfoIcon className="icon" />
                </button>
              </div>
            </header>

            <div className="chat-body" ref={chatBodyRef} onScroll={handleChatScroll}>
              {scrollDayLabel && (
                <div className="chat-day-sticky" aria-hidden="true">
                  {scrollDayLabel}
                  </div>
              )}
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

            {/* Hidden file input for attachments */}
            <input
              ref={attachFileRef}
              type="file"
              accept="image/*,video/*,audio/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain"
              style={{ display: "none" }}
              onChange={handleFileSelected}
            />

            {/* Attachment preview modal */}
            {attachPreview && (
              <div style={{ position: "absolute", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ background: "var(--panel)", borderRadius: 12, padding: 20, maxWidth: 340, width: "90%", boxShadow: "0 8px 32px var(--shadow)" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", marginBottom: 12 }}>Enviar archivo</div>
                  {attachPreview.type === "image" && (
                    <img src={attachPreview.objectUrl} alt="preview" style={{ width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 8, marginBottom: 10 }} />
                  )}
                  {attachPreview.type === "audio" && (
                    <audio controls src={attachPreview.objectUrl} style={{ width: "100%", marginBottom: 10 }} />
                  )}
                  {attachPreview.type === "video" && (
                    <video controls src={attachPreview.objectUrl} style={{ width: "100%", maxHeight: 180, marginBottom: 10, borderRadius: 8 }} />
                  )}
                  {attachPreview.type === "document" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", marginBottom: 10 }}>
                      <span style={{ fontSize: 26 }}>📄</span>
                      <span style={{ fontSize: 13, color: "var(--ink)" }}>{attachPreview.file.name}</span>
                    </div>
                  )}
                  {(attachPreview.type === "image" || attachPreview.type === "video") && (
                    <input
                      type="text"
                      placeholder="Caption (opcional)"
                      value={attachPreview.caption}
                      onChange={(e) => setAttachPreview((p) => ({ ...p, caption: e.target.value }))}
                      style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-soft)", color: "var(--ink)", fontSize: 13, marginBottom: 12 }}
                    />
                  )}
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button type="button" onClick={handleCancelAttach} style={{ padding: "8px 16px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 13 }}>
                      Cancelar
                    </button>
                    <button type="button" onClick={handleConfirmSend} style={{ padding: "8px 16px", borderRadius: 7, border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                      Enviar
                    </button>
                  </div>
                </div>
              </div>
            )}

            <form className="chat-composer" onSubmit={handleSendMessage}>
              {isAssignedToOther && (
                <div className="assign-warning">
                  Conversacion tomada por otro operador.
                </div>
              )}
              {quickActions.length > 0 && (
                <div className="quick-actions">
                  {quickActions.map((action) => (
                    <button
                      key={action}
                      className="quick-action"
                      type="button"
                      onClick={() => handleQuickAction(action)}
                      disabled={isAssignedToOther}
                    >
                      {action}
                    </button>
                  ))}
                </div>
              )}
              <div className="composer-row">
                <select
                  className="message-mode"
                  value={messageMode}
                  onChange={(event) => setMessageMode(event.target.value)}
                  disabled={isAssignedToOther}
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
                  disabled={isAssignedToOther}
                />
                {messageMode === "text" && (
                  <button
                    type="button"
                    className="attach-button"
                    title="Adjuntar archivo"
                    disabled={isAssignedToOther}
                    onClick={handleAttachClick}
                    style={{ background: "none", border: "none", cursor: isAssignedToOther ? "not-allowed" : "pointer", padding: "0 6px", color: "var(--muted)", fontSize: 20, lineHeight: 1, display: "flex", alignItems: "center" }}
                  >
                    📎
                  </button>
                )}
                <button className="send-button" type="submit" disabled={isAssignedToOther}>
                  <SendIcon className="icon" />
                </button>
              </div>
            </form>
          </div>
        </div>

        <aside className="chat-info">
          {activeConversation && (
            <div className="info-mobile-header">
              <button
                className="back-button info-mobile-back"
                type="button"
                onClick={handleBackFromInfo}
              >
                Chat
              </button>
              <div className="info-mobile-title">Info del chat</div>
            </div>
          )}
          <div className="info-card">
            <div className="info-avatar">
              <span>{getInitial(activeName)}</span>
            </div>
            <div className="info-name">{activeName}</div>
            <div className="info-phone">{activePhone || "Sin telefono"}</div>
          </div>

          <div className="info-section">
            <div className="section-header">
              <div className="section-title">Etiquetas</div>
              <button className="link-button" type="button" onClick={handleOpenTagManager}>
                Gestionar
              </button>
            </div>
            <div className="tag-list">
              {(activeConversation?.tags || []).length ? (
                activeConversation.tags.map((tag) => (
                  <span className="tag-chip" key={tag.name}>
                    <span className="tag-chip-label">{tag.name}</span>
                    <button
                      className="tag-remove"
                      type="button"
                      title="Quitar etiqueta"
                      onClick={() => handleToggleTag(tag.name)}
                    >
                      x
                    </button>
                  </span>
                ))
              ) : (
                <div className="empty-state">Sin etiquetas</div>
              )}
            </div>
            <form className="tag-form" onSubmit={handleAddTag}>
              <select
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
              >
                <option value="">Selecciona etiqueta...</option>
                {tags
                  .filter(
                    (tag) =>
                      !(activeConversation?.tags || []).some(
                        (item) => item.name === tag.name
                      )
                  )
                  .map((tag) => (
                    <option value={tag.name} key={tag.id}>
                      {tag.name}
                    </option>
                  ))}
              </select>
              <button className="icon-button" type="submit" title="Agregar">
                <PlusIcon className="icon" />
              </button>
            </form>
          </div>

          <div className="info-section">
            <div className="section-title">Notas internas</div>
            {notesList?.length ? (
              <div className="notes-stack">
                {notesList.slice(-5).map((note) => (
                  <div className="note-card" key={note.id}>
                    {note.text}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">Sin notas internas</div>
            )}
            <form className="note-form" onSubmit={handleAddNote}>
              <input
                type="text"
                placeholder="Agregar nota interna..."
                value={noteInput}
                onChange={(event) => setNoteInput(event.target.value)}
                disabled={!activeConversation}
              />
              <button className="icon-button" type="submit" title="Guardar nota">
                <PlusIcon className="icon" />
              </button>
            </form>
          </div>

          {activeConversation && (
            <div className="info-section">
              <div className="section-title">Acciones</div>
              <div className="action-stack">
                <button
                  className="ghost action-btn"
                  type="button"
                  onClick={handleAssignSelf}
                  disabled={isAssignedToOther}
                >
                  Tomar conversacion
                </button>
                {canManageStatus && (
                  <div className="reassign-card">
                    <select
                      value={reassignUserId}
                      onChange={(event) => setReassignUserId(event.target.value)}
                    >
                      <option value="">Reasignar a...</option>
                      {users.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="ghost action-btn"
                      type="button"
                      onClick={handleReassignConversation}
                      disabled={!reassignUserId}
                    >
                      Reasignar
                    </button>
                  </div>
                )}
                {canManageStatus && (
                  <div className="action-row">
                    <button
                      className="ghost action-btn"
                      type="button"
                      onClick={() => handleStatusChange("open")}
                    >
                      Reactivar bot
                    </button>
                    <button
                      className="ghost action-btn"
                      type="button"
                      onClick={() => handleStatusChange("pending")}
                    >
                      Liberar para otro operador
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
      </section>
      {showTagManager && (
      <div className="modal-overlay" onClick={handleCloseTagManager}>
        <div className="modal-card" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">Gestion de etiquetas</div>
            <button className="modal-close" type="button" onClick={handleCloseTagManager}>
              x
            </button>
          </div>
          <div className="modal-body">
            <form className="tag-manager-form" onSubmit={handleCreateTag}>
              <label className="field">
                <span>Nombre</span>
                <input
                  type="text"
                  value={tagManagerForm.name}
                  onChange={(event) =>
                    setTagManagerForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="Nombre de etiqueta"
                />
              </label>
              <label className="field">
                <span>Color</span>
                <input
                  type="color"
                  value={tagManagerForm.color}
                  onChange={(event) =>
                    setTagManagerForm((prev) => ({ ...prev, color: event.target.value }))
                  }
                />
              </label>
              <div className="modal-actions">
                <button className="primary" type="submit">
                  Crear etiqueta
                </button>
              </div>
            </form>

            <div className="tag-manager-list">
              {(tags || []).map((tag) => (
                <div className="tag-manager-row" key={tag.id}>
                  <span className="tag-chip" style={{ borderColor: tag.color || "#cbd5f5" }}>
                    <span className="tag-chip-label">{tag.name}</span>
                  </span>
                  <div className="tag-manager-actions">
                    <button
                      className="danger soft"
                      type="button"
                      onClick={() => handleDeleteTag(tag.id, tag.name)}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export default ChatView;
