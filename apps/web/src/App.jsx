
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, setToken } from "./api";
import { connectSocket } from "./socket";
import { useToast } from "./components/ToastProvider.jsx";
import NavRail from "./components/NavRail.jsx";
import ChatView from "./components/ChatView.jsx";
import DashboardView from "./components/DashboardView.jsx";
import CampaignsView from "./components/CampaignsView.jsx";
import AdminView from "./components/AdminView.jsx";
import SuperAdminView from "./components/SuperAdminView.jsx";
import TemplatesView from "./components/TemplatesView.jsx";
import TemplateEditorView from "./components/TemplateEditorView.jsx";
import NoticeBanner from "./components/NoticeBanner.jsx";

// Importar desde módulos
import { STATUS_OPTIONS, BASE_ROLE_OPTIONS, DEFAULT_ROLE_PERMISSIONS } from "./constants";
import {
  formatDate,
  formatListTime,
  formatMessageDayLabel,
  formatDuration,
  normalizeError,
} from "./utils/formatters";
import { hasRole, hasPermission, mergeRolePermissions } from "./utils/permissions";
import { sortConversations, buildQuery, getInitial, applyBrandingToCss } from "./utils/helpers";
import {
  ChatIcon,
  DashboardIcon,
  BellIcon,
  SettingsIcon,
  SunIcon,
  MoonIcon,
  UserIcon,
  SearchIcon,
  PlusIcon,
  VideoIcon,
  PhoneIcon,
  InfoIcon,
  SendIcon,
} from "./components/icons";


function App() {
  const [token, setTokenState] = useState(localStorage.getItem("token") || "");
  const [superadminToken, setSuperadminToken] = useState(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("superadmin_token") || ""
      : ""
  );
  const [user, setUser] = useState(null);
  const [branding, setBranding] = useState(null);
  const [tenantMeta, setTenantMeta] = useState(null);
  const [tenantChannels, setTenantChannels] = useState([]);
  const [channelForm, setChannelForm] = useState({ id: "", display_name: "" });
  const [lastReadMap, setLastReadMap] = useState(() => {
    if (typeof window === "undefined") {
      return {};
    }
    try {
      return JSON.parse(localStorage.getItem("last_read_map") || "{}");
    } catch (error) {
      return {};
    }
  });
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [view, setView] = useState("chats");
  const [pathname, setPathname] = useState(() =>
    typeof window !== "undefined" ? window.location.pathname : "/"
  );
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || "light"
  );
  const [isOffline, setIsOffline] = useState(
    () =>
      typeof window !== "undefined" && window.navigator
        ? !window.navigator.onLine
        : false
  );
  const [showFilters, setShowFilters] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(
    false
  );
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasUnread, setHasUnread] = useState(false);
  const [scrollDayLabel, setScrollDayLabel] = useState("");
  const messageInputRef = useRef(null);
  const chatBodyRef = useRef(null);
  const dayLabelRafRef = useRef(null);
  const lastMessageMetaRef = useRef({
    conversationId: null,
    lastId: null,
    length: 0,
  });
  const loadConversationRef = useRef(0);
  const scrollOnLoadRef = useRef(false);
  const rolePermissionsVersion = useRef(0);
  const [settingsSection, setSettingsSection] = useState("users");
  const [settingsTab, setSettingsTab] = useState("list");
  const [rolePermissions, setRolePermissions] = useState(() =>
    mergeRolePermissions(null)
  );
  const [rolePermissionsLoaded, setRolePermissionsLoaded] = useState(false);
  const [rolePermissionsDirty, setRolePermissionsDirty] = useState(false);
  const [rolePermissionsSaving, setRolePermissionsSaving] = useState(false);
  const roleOptions = useMemo(() => {
    const extras = Object.keys(rolePermissions || {}).filter(
      (role) => !BASE_ROLE_OPTIONS.includes(role)
    );
    return [...BASE_ROLE_OPTIONS, ...extras];
  }, [rolePermissions]);

  const [filters, setFilters] = useState({
    status: "",
    assigned_user_id: "",
    tag: "",
    search: "",
    phone_number_id: "",
  });
  const isSuperAdminRoute = pathname.startsWith("/superadmin");
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageMode, setMessageMode] = useState("text");
  const [tags, setTags] = useState([]);
  const [users, setUsers] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [reassignUserId, setReassignUserId] = useState("");
  const [showTagManager, setShowTagManager] = useState(false);
  const [tagManagerForm, setTagManagerForm] = useState({
    name: "",
    color: "#6b7280",
  });
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [pageError, setPageError] = useState("");
  const { pushToast } = useToast();
  const pendingUserDeletesRef = useRef(new Map());
  const pendingRoleDeletesRef = useRef(new Map());
  const pendingTemplateDeletesRef = useRef(new Map());
  const pendingTagDeletesRef = useRef(new Map());
  const conversationStatusRef = useRef(new Map());

  const [metrics, setMetrics] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignsTotal, setCampaignsTotal] = useState(0);
  const [campaignMessages, setCampaignMessages] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [selectedTemplateForEdit, setSelectedTemplateForEdit] = useState(null);
  const [audiences, setAudiences] = useState([]);
  const [contactStats, setContactStats] = useState(null);
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    template_id: "",
    scheduled_for: "",
    send_now: true,
  });
  const [campaignFilter, setCampaignFilter] = useState({
    status: "",
    tag: "",
    assigned_user_id: "",
    verified_only: false,
    segment_id: "",
    segment_name: "",
  });

  const [adminUsers, setAdminUsers] = useState([]);
  const [userForm, setUserForm] = useState({
    id: "",
    name: "",
    email: "",
    role: "recepcion",
    password: "",
    is_active: true,
  });

  const [settings, setSettings] = useState(null);

  const [branches, setBranches] = useState([]);
  const [services, setServices] = useState([]);
  const [branchForm, setBranchForm] = useState({
    id: "",
    code: "",
    name: "",
    address: "",
    lat: "",
    lng: "",
    hours_text: "",
    phone: "",
    is_active: true,
  });
  const [serviceForm, setServiceForm] = useState({
    id: "",
    code: "",
    name: "",
    subtitle: "",
    description: "",
    price_bob: "",
    duration_min: "",
    image_url: "",
    is_featured: false,
    is_active: true,
  });

  const [templateForm, setTemplateForm] = useState({
    id: "",
    name: "",
    language: "es",
    category: "",
    body_preview: "",
    is_active: true,
  });
  const [auditLogs, setAuditLogs] = useState([]);
  const displayBrandName =
    (branding?.brand_name || tenantMeta?.name || "Perzivalh").trim();
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [messagesLoadingMore, setMessagesLoadingMore] = useState(false);
  const [messagesCursor, setMessagesCursor] = useState(null);

  const MESSAGE_WINDOW_HOURS = 48;
  const INITIAL_MESSAGE_LIMIT = 80;
  const LOAD_MORE_LIMIT = 60;
  const MAX_MESSAGES_IN_MEMORY = 320;
  const CACHE_MESSAGE_LIMIT = 120;
  const MAX_CACHE_CONVERSATIONS = 5;
  const CACHE_TTL_MS = 2 * 60 * 1000;
  const messageCacheRef = useRef(new Map());

  function pruneMessageCache() {
    const cache = messageCacheRef.current;
    while (cache.size > MAX_CACHE_CONVERSATIONS) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
  }

  function getCachedConversation(conversationId) {
    const cache = messageCacheRef.current;
    const entry = cache.get(conversationId);
    if (!entry) {
      return null;
    }
    if (Date.now() - entry.updatedAt > CACHE_TTL_MS) {
      cache.delete(conversationId);
      return null;
    }
    return entry;
  }

  function setCachedConversation(conversationId, payload) {
    const cache = messageCacheRef.current;
    cache.delete(conversationId);
    cache.set(conversationId, { ...payload, updatedAt: Date.now() });
    pruneMessageCache();
  }

  const navigateTo = useCallback((nextPath, options = {}) => {
    if (typeof window === "undefined") {
      return;
    }
    const target = nextPath || "/";
    if (window.location.pathname === target) {
      setPathname(target);
      return;
    }
    if (options.replace) {
      window.history.replaceState({}, "", target);
    } else {
      window.history.pushState({}, "", target);
    }
    setPathname(target);
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === campaignForm.template_id),
    [templates, campaignForm.template_id]
  );
  const latestNote = useMemo(() => {
    const note = [...messages].reverse().find((message) => message.type === "note");
    return note?.text || "";
  }, [messages]);
  const notesList = useMemo(
    () => messages.filter((message) => message.type === "note"),
    [messages]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const handlePopState = () => {
      setPathname(window.location.pathname || "/");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (token) {
      setToken(token);
    } else {
      setToken(null);
    }
  }, [token]);

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const handleStatus = () => {
      setIsOffline(!window.navigator.onLine);
    };
    handleStatus();
    window.addEventListener("online", handleStatus);
    window.addEventListener("offline", handleStatus);
    return () => {
      window.removeEventListener("online", handleStatus);
      window.removeEventListener("offline", handleStatus);
    };
  }, []);

  useEffect(() => {
    setHasUnread(false);
    setIsAtBottom(true);
    requestAnimationFrame(() => {
      scrollChatToBottom();
    });
    if (activeConversation) {
      markConversationRead(activeConversation);
    }
  }, [activeConversation?.id]);

  useEffect(() => {
    if (view !== "chats") {
      return;
    }
    setHasUnread(false);
    setIsAtBottom(true);
    requestAnimationFrame(() => {
      scrollChatToBottom();
    });
  }, [view, activeConversation?.id]);

  useEffect(() => {
    if (!activeConversation) {
      setScrollDayLabel("");
      return;
    }
    const lastMessage = messages[messages.length - 1];
    const lastId =
      lastMessage?.id ||
      lastMessage?.created_at ||
      (messages.length ? `${messages.length}` : null);
    const prev = lastMessageMetaRef.current;
    const sameConversation = prev.conversationId === activeConversation.id;
    const hasNewMessage =
      sameConversation &&
      lastMessage &&
      prev.lastId &&
      lastId !== prev.lastId;

    if (scrollOnLoadRef.current && messages.length > 0) {
      scrollOnLoadRef.current = false;
      requestAnimationFrame(() => {
        scrollChatToBottom();
      });
      return;
    }

    if (hasNewMessage) {
      if (isAtBottom) {
        scrollChatToBottom();
      } else {
        setHasUnread(true);
      }
    } else if (isAtBottom) {
      setHasUnread(false);
    }

    lastMessageMetaRef.current = {
      conversationId: activeConversation.id,
      lastId,
      length: messages.length,
    };
    scheduleDayLabelUpdate();

    if (isAtBottom && messages.length > MAX_MESSAGES_IN_MEMORY) {
      const trimmed = messages.slice(-MAX_MESSAGES_IN_MEMORY);
      setMessages(trimmed);
      setMessagesCursor(trimmed[0]?.created_at || null);
      setMessagesHasMore(true);
    }
  }, [messages, activeConversation?.id, isAtBottom]);

  useEffect(() => {
    if (!activeConversation?.id) {
      return;
    }
    if (!messages.length) {
      return;
    }
    const payload = {
      messages: messages.slice(-CACHE_MESSAGE_LIMIT),
      cursor: messagesCursor || messages[0]?.created_at || null,
      hasMore: messagesHasMore,
    };
    setCachedConversation(activeConversation.id, payload);
  }, [messages, messagesCursor, messagesHasMore, activeConversation?.id]);

  useEffect(() => {
    if (view === "chats") {
      return;
    }
    setIsAtBottom(false);
  }, [view]);

  useEffect(() => {
    if (!token) {
      return;
    }
    let active = true;
    apiGet("/api/me")
      .then((data) => {
        if (!active) {
          return;
        }
        setUser(data.user);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setTokenState("");
        setUser(null);
      });
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!user || user.role === "superadmin") {
      setBranding(null);
      setTenantChannels([]);
      applyBrandingToCss(null);
      return;
    }
    let active = true;
    apiGet("/api/branding")
      .then((data) => {
        if (!active) {
          return;
        }
        setBranding(data.branding || null);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setBranding(null);
      });
    apiGet("/api/tenant")
      .then((data) => {
        if (!active) {
          return;
        }
        setTenantMeta(data.tenant || null);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setTenantMeta(null);
      });
    apiGet("/api/channels")
      .then((data) => {
        if (!active) {
          return;
        }
        setTenantChannels(data.channels || []);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setTenantChannels([]);
      });
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    applyBrandingToCss(branding);
  }, [branding]);

  useEffect(() => {
    if (!user) {
      return;
    }
    if (user.role === "superadmin") {
      if (!isSuperAdminRoute) {
        navigateTo("/superadmin", { replace: true });
      }
      return;
    }
    if (isSuperAdminRoute) {
      navigateTo("/", { replace: true });
    }
  }, [user, isSuperAdminRoute, navigateTo]);

  useEffect(() => {
    if (!user) {
      return;
    }
    if (user.role === "superadmin") {
      return;
    }
    void loadUsers();
    void loadTags();
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }
    if (user.role === "superadmin") {
      return;
    }
    void loadRolePermissions();
  }, [user]);

  useEffect(() => {
    if (!user || view !== "chats") {
      return;
    }
    if (user.role === "superadmin") {
      return;
    }
    void loadConversations();
  }, [user, view, filters]);

  useEffect(() => {
    if (!user) {
      return;
    }
    if (user.role === "superadmin") {
      return;
    }
    if (view === "dashboard") {
      void loadMetrics();
    }
    if (view === "campaigns") {
      void loadTemplates();
      void loadCampaigns(1, 6);
    }
  }, [user, view]);

  useEffect(() => {
    if (!user || view !== "admin") {
      return;
    }
    const roleAccess =
      rolePermissions?.[user.role] || DEFAULT_ROLE_PERMISSIONS[user.role];
    const canUsers = hasPermission(roleAccess, "settings", "users");
    const canBot = hasPermission(roleAccess, "settings", "bot");
    const canGeneral = hasPermission(roleAccess, "settings", "general");
    const canTemplates = hasPermission(roleAccess, "settings", "templates");
    const canAudit = hasPermission(roleAccess, "settings", "audit");

    if (settingsSection === "users" && canUsers) {
      void loadAdminUsers();
    }
    if (settingsSection === "bot" && canBot) {
      void loadSettings();
    }
    if (settingsSection === "general" && canGeneral) {
      void loadCatalog();
    }
    if (settingsSection === "templates" && canTemplates) {
      void loadTemplates();
    }
    if (settingsSection === "audit" && canAudit) {
      void loadAuditLogs();
    }
  }, [user, view, settingsSection, rolePermissions]);

  useEffect(() => {
    if (!user || view !== "admin") {
      return;
    }
    const roleAccess =
      rolePermissions?.[user.role] || DEFAULT_ROLE_PERMISSIONS[user.role];
    const sections = ["general", "users", "bot", "templates", "audit", "odoo"];
    const allowed = sections.filter((section) =>
      hasPermission(roleAccess, "settings", section)
    );
    if (!allowed.length) {
      setView(result.user.role === "superadmin" ? "superadmin" : "chats");
      return;
    }
    if (!allowed.includes(settingsSection)) {
      setSettingsSection(allowed[0]);
    }
  }, [user, view, settingsSection, rolePermissions]);

  useEffect(() => {
    if (!token) {
      return;
    }
    if (user?.role === "superadmin") {
      return;
    }
    const socket = connectSocket(token);
    const pendingSoundRef = { current: null };
    const SOUND_SOURCES = [
      "/sounds/new-notification-09-352705.wav",
      "/sounds/new-notification-09-352705.mp3",
    ];
    const ensurePendingAudio = () => {
      if (pendingSoundRef.current) {
        return pendingSoundRef.current;
      }
      const audio = new Audio(SOUND_SOURCES[0]);
      audio.volume = 1;
      let sourceIndex = 0;
      audio.addEventListener("error", () => {
        sourceIndex += 1;
        if (sourceIndex < SOUND_SOURCES.length) {
          audio.src = SOUND_SOURCES[sourceIndex];
          audio.load();
        }
      });
      pendingSoundRef.current = audio;
      return audio;
    };
    const unlockAudio = () => {
      const audio = ensurePendingAudio();
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
      }).catch(() => {
        // ignore autoplay errors
      });
    };
    window.addEventListener("click", unlockAudio, { once: true });
    window.addEventListener("touchstart", unlockAudio, { once: true });

    const playPendingSound = () => {
      if (typeof window === "undefined") return;
      try {
        const audio = ensurePendingAudio();
        audio.currentTime = 0;
        audio.play().catch(() => {
          // ignore autoplay errors
        });
      } catch (error) {
        // ignore audio errors
      }
    };

    socket.on("conversation:update", ({ conversation }) => {
      const prevStatus = conversationStatusRef.current.get(conversation.id);
      conversationStatusRef.current.set(conversation.id, conversation.status);
      if (
        conversation.status === "pending" &&
        !conversation.assigned_user_id &&
        prevStatus !== "pending"
      ) {
        playPendingSound();
        pushToast({ message: "Nueva conversación pendiente" });
      }
      setConversations((prev) => {
        const next = prev.map((item) =>
          item.id === conversation.id ? { ...item, ...conversation } : item
        );
        if (!next.find((item) => item.id === conversation.id)) {
          next.push(conversation);
        }
        return sortConversations(next);
      });
      setActiveConversation((prev) =>
        prev?.id === conversation.id ? { ...prev, ...conversation } : prev
      );
    });
    socket.on("message:new", ({ conversation, message }) => {
      if (
        conversation.status === "pending" &&
        !conversation.assigned_user_id
      ) {
        playPendingSound();
      }
      const enrichedConversation = {
        ...conversation,
        last_message_text: message?.text || null,
        last_message_type: message?.type || null,
        last_message_direction: message?.direction || null,
        last_message_at: message?.created_at || conversation.last_message_at,
      };
      setConversations((prev) => {
        const next = prev.map((item) =>
          item.id === conversation.id ? { ...item, ...enrichedConversation } : item
        );
        if (!next.find((item) => item.id === conversation.id)) {
          next.push(enrichedConversation);
        }
        return sortConversations(next);
      });
      setActiveConversation((prev) =>
        prev?.id === conversation.id ? { ...prev, ...enrichedConversation } : prev
      );
      setMessages((prev) => {
        if (!activeConversation || activeConversation.id !== conversation.id) {
          return prev;
        }
        markConversationRead(enrichedConversation);
        return [...prev, message];
      });
    });
    return () => {
      socket.disconnect();
    };
  }, [token, activeConversation]);

  useEffect(() => {
    if (!user) {
      return;
    }
    if (user.role === "superadmin") {
      if (view !== "superadmin") {
        setView("superadmin");
      }
      return;
    }
    const roleAccess =
      rolePermissions?.[user.role] || DEFAULT_ROLE_PERMISSIONS[user.role];
    const canChat = hasPermission(roleAccess, "modules", "chat");
    const canDashboard = hasPermission(roleAccess, "modules", "dashboard");
    const canCampaigns = hasPermission(roleAccess, "modules", "campaigns");
    const canSettings = hasPermission(roleAccess, "modules", "settings");
    if (view === "chats" && !canChat) {
      setView(canDashboard ? "dashboard" : canCampaigns ? "campaigns" : "admin");
    }
    if (view === "dashboard" && !canDashboard) {
      setView(canChat ? "chats" : canCampaigns ? "campaigns" : "admin");
    }
    if (view === "campaigns" && !canCampaigns) {
      setView(canChat ? "chats" : canDashboard ? "dashboard" : "admin");
    }
    if (view === "admin" && !canSettings) {
      setView(canChat ? "chats" : canDashboard ? "dashboard" : "campaigns");
    }
  }, [user, view, rolePermissions]);

  useEffect(() => {
    if (!user || user.role !== "admin") {
      return;
    }
    if (!rolePermissionsLoaded || !rolePermissionsDirty || rolePermissionsSaving) {
      return;
    }
    const handle = setTimeout(() => {
      const saveVersion = rolePermissionsVersion.current;
      setRolePermissionsSaving(true);
      apiPatch("/api/admin/role-permissions", {
        permissions: rolePermissions,
      })
        .then(() => {
          if (rolePermissionsVersion.current === saveVersion) {
            setRolePermissionsDirty(false);
          }
        })
        .catch((error) => {
          setPageError(normalizeError(error));
        })
        .finally(() => {
          setRolePermissionsSaving(false);
        });
    }, 350);
    return () => clearTimeout(handle);
  }, [
    user,
    rolePermissions,
    rolePermissionsDirty,
    rolePermissionsLoaded,
    rolePermissionsSaving,
  ]);
  async function loadUsers() {
    try {
      const data = await apiGet("/api/users");
      setUsers(data.users || []);
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function loadRolePermissions() {
    try {
      const data = await apiGet("/api/role-permissions");
      const merged = mergeRolePermissions(data.permissions || null);
      rolePermissionsVersion.current = 0;
      setRolePermissions(merged);
      setRolePermissionsDirty(false);
      setRolePermissionsLoaded(true);
    } catch (error) {
      setPageError(normalizeError(error));
      setRolePermissionsLoaded(true);
    }
  }

  async function loadTags() {
    try {
      const data = await apiGet("/api/tags");
      setTags(data.tags || []);
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function loadConversations() {
    try {
      const query = buildQuery(filters);
      const data = await apiGet(`/api/conversations${query}`);
      setConversations(sortConversations(data.conversations || []));
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function loadConversation(conversationId) {
    scrollOnLoadRef.current = true;
    const cached = getCachedConversation(conversationId);
    const quickConversation = conversations.find((item) => item.id === conversationId);
    setLoadingConversation(!cached);
    resetMessageState();
    if (quickConversation) {
      setActiveConversation(quickConversation);
    }
    if (cached) {
      setMessages(cached.messages || []);
      setMessagesCursor(cached.cursor || null);
      setMessagesHasMore(Boolean(cached.hasMore));
      scheduleDayLabelUpdate();
      requestAnimationFrame(() => {
        scrollChatToBottom();
      });
    }
    const requestId = loadConversationRef.current + 1;
    loadConversationRef.current = requestId;
    try {
      const query = `?limit=${INITIAL_MESSAGE_LIMIT}&window_hours=${MESSAGE_WINDOW_HOURS}`;
      const data = await apiGet(`/api/conversations/${conversationId}${query}`);
      if (loadConversationRef.current !== requestId) {
        return;
      }
      let conversation = data.conversation;
      const messages = data.messages || [];

      if (
        conversation?.status === "pending" &&
        !conversation.assigned_user_id &&
        user?.id
      ) {
        try {
          const assigned = await apiPatch(`/api/conversations/${conversationId}/assign`, {});
          conversation = assigned.conversation;
        } catch (error) {
          if (String(normalizeError(error)).includes("already_assigned")) {
            pushToast({ type: "error", message: "Conversación tomada por otro operador" });
          }
        }
      }

      setActiveConversation(conversation);
      setMessages(messages);
      setMessagesHasMore(Boolean(data.has_more));
      setMessagesCursor(data.next_cursor || messages[0]?.created_at || null);
      setCachedConversation(conversationId, {
        messages: messages.slice(-CACHE_MESSAGE_LIMIT),
        cursor: data.next_cursor || messages[0]?.created_at || null,
        hasMore: Boolean(data.has_more),
      });
      markConversationRead(conversation);
    } catch (error) {
      setPageError(normalizeError(error));
    } finally {
      if (loadConversationRef.current === requestId) {
        setLoadingConversation(false);
      }
    }
  }

  async function loadOlderMessages(conversationId) {
    if (!messagesHasMore || messagesLoadingMore) {
      return;
    }
    const cursor = messagesCursor;
    if (!cursor) {
      setMessagesHasMore(false);
      return;
    }
    setMessagesLoadingMore(true);
    const el = chatBodyRef.current;
    const prevHeight = el ? el.scrollHeight : 0;
    const prevScrollTop = el ? el.scrollTop : 0;
    try {
      const query = `?limit=${LOAD_MORE_LIMIT}&before=${encodeURIComponent(cursor)}`;
      const data = await apiGet(`/api/conversations/${conversationId}${query}`);
      if (activeConversation?.id !== conversationId) {
        return;
      }
      const older = data.messages || [];
      if (older.length) {
        setMessages((prev) => {
          const seen = new Set(prev.map((msg) => msg.id));
          const uniqueOlder = older.filter((msg) => !seen.has(msg.id));
          return [...uniqueOlder, ...prev];
        });
        setMessagesCursor(data.next_cursor || older[0]?.created_at || cursor);
        setMessagesHasMore(Boolean(data.has_more));
        requestAnimationFrame(() => {
          const node = chatBodyRef.current;
          if (!node) {
            return;
          }
          const newHeight = node.scrollHeight;
          node.scrollTop = newHeight - prevHeight + prevScrollTop;
        });
      } else {
        setMessagesHasMore(false);
      }
    } catch (error) {
      setPageError(normalizeError(error));
    } finally {
      setMessagesLoadingMore(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError("");
    try {
      const result = await apiPost("/api/auth/login", {
        email: loginForm.email,
        password: loginForm.password,
      });
      setTokenState(result.token);
      setToken(result.token);
      setUser(result.user);
      setSuperadminToken("");
      localStorage.removeItem("superadmin_token");
      const isSuperAdmin = result.user.role === "superadmin";
      setView(isSuperAdmin ? "superadmin" : "chats");
      if (isSuperAdmin) {
        navigateTo("/superadmin", { replace: true });
      } else if (isSuperAdminRoute) {
        navigateTo("/", { replace: true });
      }
    } catch (error) {
      setLoginError("Credenciales invalidas");
    }
  }

  function handleLogout() {
    setTokenState("");
    setToken(null);
    setUser(null);
    setConversations([]);
    setActiveConversation(null);
    setMessages([]);
    setView("chats");
    setIsProfileOpen(false);
    setRolePermissions(mergeRolePermissions(null));
    setRolePermissionsLoaded(false);
    setRolePermissionsDirty(false);
    setRolePermissionsSaving(false);
    rolePermissionsVersion.current = 0;
    setSuperadminToken("");
    localStorage.removeItem("superadmin_token");
    navigateTo("/", { replace: true });
  }

  async function handleImpersonateTenant(tenantId) {
    const result = await apiPost(`/api/superadmin/tenants/${tenantId}/impersonate`);
    if (!superadminToken && token) {
      localStorage.setItem("superadmin_token", token);
      setSuperadminToken(token);
    }
    setTokenState(result.token);
    setToken(result.token);
    setUser(result.user);
    setView("chats");
    navigateTo("/", { replace: true });
  }

  function handleReturnToSuperadmin() {
    const stored =
      superadminToken ||
      (typeof window !== "undefined"
        ? localStorage.getItem("superadmin_token")
        : "");
    if (!stored) {
      handleLogout();
      return;
    }
    localStorage.removeItem("superadmin_token");
    setSuperadminToken("");
    setTokenState(stored);
    setToken(stored);
    setUser(null);
    setView("chats");
    navigateTo("/superadmin", { replace: true });
  }

  function handleRolePermissionsUpdate(updater) {
    setRolePermissions((prev) =>
      typeof updater === "function" ? updater(prev) : updater
    );
    rolePermissionsVersion.current += 1;
    setRolePermissionsDirty(true);
  }

  function toggleTheme() {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }

  function scrollChatToBottom() {
    const el = chatBodyRef.current;
    if (!el) {
      return;
    }
    el.scrollTop = el.scrollHeight;
    setIsAtBottom(true);
    setHasUnread(false);
    scheduleDayLabelUpdate();
  }

  function markConversationRead(conversation) {
    if (!conversation?.id || !conversation?.last_message_at) {
      return;
    }
    setLastReadMap((prev) => {
      const next = {
        ...prev,
        [conversation.id]: conversation.last_message_at,
      };
      localStorage.setItem("last_read_map", JSON.stringify(next));
      return next;
    });
  }

  function handleChatScroll() {
    const el = chatBodyRef.current;
    if (!el) {
      return;
    }
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < 24;
    setIsAtBottom(atBottom);
    if (atBottom) {
      setHasUnread(false);
    }
    if (
      el.scrollTop < 120 &&
      messagesHasMore &&
      !messagesLoadingMore &&
      activeConversation
    ) {
      void loadOlderMessages(activeConversation.id);
    }
    scheduleDayLabelUpdate();
  }

  function resetMessageState() {
    setMessages([]);
    setMessagesCursor(null);
    setMessagesHasMore(false);
    setMessagesLoadingMore(false);
    lastMessageMetaRef.current = {
      conversationId: null,
      lastId: null,
      length: 0,
    };
  }

  function scheduleDayLabelUpdate() {
    if (dayLabelRafRef.current) {
      return;
    }
    dayLabelRafRef.current = requestAnimationFrame(() => {
      dayLabelRafRef.current = null;
      updateVisibleDayLabel();
    });
  }

  function updateVisibleDayLabel() {
    const el = chatBodyRef.current;
    if (!el) {
      return;
    }
    const pills = el.querySelectorAll(".day-pill");
    if (!pills.length) {
      setScrollDayLabel("");
      return;
    }
    const scrollTop = el.scrollTop;
    const offset = 12;
    let current = pills[0];
    for (const pill of pills) {
      if (pill.offsetTop - offset <= scrollTop) {
        current = pill;
      } else {
        break;
      }
    }
    const nextLabel = current.dataset.dayLabel || current.textContent || "";
    setScrollDayLabel(nextLabel);
  }

  function handleBackToList() {
    setActiveConversation(null);
    resetMessageState();
  }

  function handleQuickAction(text) {
    setMessageDraft(text);
    messageInputRef.current?.focus();
  }

  async function handleSendMessage(event) {
    event.preventDefault();
    if (!activeConversation || !messageDraft.trim()) {
      return;
    }
    const text = messageDraft.trim();
    setMessageDraft("");
    try {
      await apiPost(`/api/conversations/${activeConversation.id}/messages`, {
        text,
        type: messageMode,
      });
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function handleAddNote(event) {
    event.preventDefault();
    if (!activeConversation || !noteInput.trim()) {
      return;
    }
    const text = noteInput.trim();
    setNoteInput("");
    try {
      const data = await apiPost(`/api/conversations/${activeConversation.id}/messages`, {
        text,
        type: "note",
      });
      if (data?.message) {
        setMessages((prev) => [...prev, data.message]);
      }
      if (data?.conversation) {
        setActiveConversation(data.conversation);
      }
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function handleAssignSelf() {
    if (!activeConversation) {
      return;
    }
    try {
      const data = await apiPatch(`/api/conversations/${activeConversation.id}/assign`);
      setActiveConversation(data.conversation);
    } catch (error) {
      const message = normalizeError(error) || "No se pudo tomar la conversacion";
      pushToast({ type: "error", message });
    }
  }

  async function handleReassignConversation() {
    if (!activeConversation || !reassignUserId) {
      return;
    }
    try {
      const data = await apiPatch(`/api/conversations/${activeConversation.id}/assign`, {
        user_id: reassignUserId,
      });
      setActiveConversation(data.conversation);
      setReassignUserId("");
      pushToast({ message: "Conversación reasignada" });
    } catch (error) {
      const message = normalizeError(error) || "No se pudo reasignar";
      pushToast({ type: "error", message });
    }
  }

  async function handleStatusChange(status) {
    if (!activeConversation) {
      return;
    }
    try {
      const data = await apiPatch(`/api/conversations/${activeConversation.id}/status`, {
        status,
      });
      let nextConversation = data.conversation;
      if (status === "open" && nextConversation?.tags?.length) {
        const pendingTag = nextConversation.tags.find(
          (tag) => (tag.name || "").toLowerCase() === "pendiente"
        );
        if (pendingTag) {
          try {
            const tagResult = await apiPost(
              `/api/conversations/${nextConversation.id}/tags`,
              { add: [], remove: [pendingTag.name] }
            );
            nextConversation = tagResult.conversation || nextConversation;
          } catch (error) {
            nextConversation = {
              ...nextConversation,
              tags: nextConversation.tags.filter((tag) => tag.name !== pendingTag.name),
            };
          }
        }
      }
      setActiveConversation(nextConversation);
      setConversations((prev) =>
        prev.map((item) =>
          item.id === nextConversation.id ? { ...item, ...nextConversation } : item
        )
      );
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function handleToggleTag(tagName) {
    if (!activeConversation) {
      return;
    }
    const hasTag =
      activeConversation.tags?.some((tag) => tag.name === tagName) || false;
    if (hasTag) {
      const key = `${activeConversation.id}:${tagName}`;
      if (pendingTagDeletesRef.current.has(key)) {
        return;
      }
      const snapshot = activeConversation;
      const nextConversation = {
        ...activeConversation,
        tags: (activeConversation.tags || []).filter((tag) => tag.name !== tagName),
      };
      setActiveConversation(nextConversation);
      const timer = setTimeout(async () => {
        try {
          const data = await apiPost(`/api/conversations/${snapshot.id}/tags`, {
            add: [],
            remove: [tagName],
          });
          if (activeConversation?.id === snapshot.id) {
            setActiveConversation(data.conversation);
          }
        } catch (error) {
          if (activeConversation?.id === snapshot.id) {
            setActiveConversation(snapshot);
          }
          pushToast({
            type: "error",
            message: normalizeError(error) || "No se pudo eliminar el tag",
          });
        } finally {
          pendingTagDeletesRef.current.delete(key);
        }
      }, 8000);
      pendingTagDeletesRef.current.set(key, { timer, snapshot });
      pushToast({
        message: "Tag eliminado. Deshacer disponible",
        actionLabel: "DESHACER",
        duration: 8000,
        onAction: async () => {
          const pending = pendingTagDeletesRef.current.get(key);
          if (pending?.timer) {
            clearTimeout(pending.timer);
          }
          if (pending?.snapshot) {
            setActiveConversation(pending.snapshot);
          } else {
            setActiveConversation(snapshot);
          }
          pendingTagDeletesRef.current.delete(key);
          pushToast({ message: "Eliminación cancelada" });
        },
      });
      return;
    }
    try {
      const data = await apiPost(`/api/conversations/${activeConversation.id}/tags`, {
        add: hasTag ? [] : [tagName],
        remove: hasTag ? [tagName] : [],
      });
      setActiveConversation(data.conversation);
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function handleAddTag(event) {
    event.preventDefault();
    if (!tagInput.trim() || !activeConversation) {
      return;
    }
    const name = tagInput.trim();
    setTagInput("");
    try {
      const data = await apiPost(`/api/conversations/${activeConversation.id}/tags`, {
        add: [name],
      });
      setActiveConversation(data.conversation);
      await loadTags();
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function handleCreateTag(event) {
    event.preventDefault();
    const name = tagManagerForm.name.trim();
    if (!name) {
      setPageError("Completa el nombre de la etiqueta");
      return;
    }
    try {
      await apiPost("/api/tags", {
        name,
        color: tagManagerForm.color || null,
      });
      setTagManagerForm({ name: "", color: "#6b7280" });
      await loadTags();
      pushToast({ message: "Etiqueta creada" });
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function handleDeleteTag(tagId, tagName) {
    if (!tagId) {
      return;
    }
    try {
      await apiDelete(`/api/tags/${tagId}`);
      setActiveConversation((prev) =>
        prev
          ? {
              ...prev,
              tags: (prev.tags || []).filter((tag) => tag.name !== tagName),
            }
          : prev
      );
      await loadTags();
      pushToast({ message: "Etiqueta eliminada" });
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function loadMetrics() {
    try {
      const data = await apiGet("/api/dashboard/metrics");
      setMetrics(data);
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function loadTemplates() {
    try {
      // Try new API first, fallback to old admin API
      const data = await apiGet("/api/templates").catch(() => apiGet("/api/admin/templates"));
      setTemplates(data.templates || []);
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function syncTemplatesFromMeta() {
    try {
      await apiGet("/api/templates/sync");
      await loadTemplates();
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function saveTemplateDraft(data) {
    try {
      if (selectedTemplateForEdit?.id) {
        await apiPatch(`/api/templates/${selectedTemplateForEdit.id}`, data);
      } else {
        const result = await apiPost("/api/templates/draft", data);
        setSelectedTemplateForEdit(result.template);
      }
      await loadTemplates();
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function submitTemplateToMeta() {
    if (!selectedTemplateForEdit?.id) return;
    try {
      await apiPost(`/api/templates/${selectedTemplateForEdit.id}/submit`);
      setSelectedTemplateForEdit(null);
      await loadTemplates();
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function loadAudiences() {
    try {
      const data = await apiGet("/api/audiences");
      setAudiences(data.segments || []);
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function importOdooContacts() {
    try {
      await apiPost("/api/contacts/import-odoo");
      await loadContactStats();
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function loadContactStats() {
    try {
      const data = await apiGet("/api/contacts/stats");
      setContactStats(data);
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function loadCampaigns(page = 1, pageSize = 6, query = "") {
    try {
      const qs = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (query) {
        qs.set("q", query);
      }
      const data = await apiGet(`/api/admin/campaigns?${qs.toString()}`);
      setCampaigns(data.campaigns || []);
      setCampaignsTotal(Number.isFinite(data.total) ? data.total : (data.campaigns || []).length);
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function loadCampaignMessages(campaignId) {
    setSelectedCampaignId(campaignId);
    try {
      const data = await apiGet(`/api/admin/campaigns/${campaignId}/messages`);
      setCampaignMessages(data.messages || []);
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function handleCreateCampaign(event) {
    event.preventDefault();
    if (!campaignForm.name.trim() || !campaignForm.template_id) {
      setPageError("Completa el nombre y plantilla");
      return;
    }
    const filter = {};
    if (campaignFilter.status) {
      filter.status = campaignFilter.status;
    }
    if (campaignFilter.tag) {
      filter.tag = campaignFilter.tag.trim();
    }
    if (campaignFilter.assigned_user_id) {
      filter.assigned_user_id = campaignFilter.assigned_user_id;
    }
    if (campaignFilter.verified_only) {
      filter.verified_only = true;
    }
    if (campaignFilter.segment_id) {
      filter.segment_id = campaignFilter.segment_id;
      if (campaignFilter.segment_name) {
        filter.segment_name = campaignFilter.segment_name;
      }
    }
    try {
      const result = await apiPost("/api/admin/campaigns", {
        name: campaignForm.name.trim(),
        template_id: campaignForm.template_id,
        audience_filter: filter,
        scheduled_for: campaignForm.scheduled_for || null,
      });
      if (campaignForm.send_now && !campaignForm.scheduled_for) {
        const campaignId = result?.campaign?.id;
        if (campaignId) {
          await apiPost(`/api/admin/campaigns/${campaignId}/send`, {});
        }
      }
      setCampaignForm({
        name: "",
        template_id: "",
        scheduled_for: "",
        send_now: true,
      });
      setCampaignFilter({
        status: "",
        tag: "",
        assigned_user_id: "",
        verified_only: false,
        segment_id: "",
        segment_name: "",
      });
      await loadCampaigns(1, 6);
      pushToast({ message: "Campaña creada correctamente" });
    } catch (error) {
      setPageError(normalizeError(error));
      pushToast({ type: "error", message: normalizeError(error) || "Error al crear campaña" });
    }
  }

  async function handleSendCampaign(campaignId) {
    try {
      await apiPost(`/api/admin/campaigns/${campaignId}/send`, {});
      await loadCampaigns(1, 6);
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function handleUpdateCampaign(campaignId, payload) {
    try {
      const data = await apiPut(`/api/admin/campaigns/${campaignId}`, payload);
      setCampaigns((prev) =>
        prev.map((item) => (item.id === campaignId ? data.campaign || item : item))
      );
      await loadCampaigns(1, 6);
      pushToast({ message: "Campaña actualizada" });
    } catch (error) {
      const message = normalizeError(error) || "No se pudo actualizar";
      setPageError(message);
      pushToast({ type: "error", message });
    }
  }

  async function handleDeleteCampaign(campaignId) {
    try {
      await apiDelete(`/api/admin/campaigns/${campaignId}`);
      await loadCampaigns(1, 6);
      pushToast({ message: "Campaña eliminada" });
    } catch (error) {
      const message = normalizeError(error) || "No se pudo eliminar";
      setPageError(message);
      pushToast({ type: "error", message });
    }
  }

  async function handleResendCampaign(campaignId) {
    try {
      await apiPost(`/api/admin/campaigns/${campaignId}/send`, {});
      await loadCampaigns(1, 6);
      pushToast({ message: "Campaña reenviada" });
    } catch (error) {
      const message = normalizeError(error) || "No se pudo reenviar";
      setPageError(message);
      pushToast({ type: "error", message });
    }
  }

  async function handleSyncTemplates() {
    try {
      await apiGet("/api/templates/sync");
      await loadTemplates();
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function loadAdminUsers() {
    try {
      const data = await apiGet("/api/admin/users");
      setAdminUsers(data.users || []);
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function handleUserSubmit(event) {
    event.preventDefault();
    if (!userForm.name.trim() || !userForm.role) {
      setPageError("Completa los campos requeridos");
      return;
    }
    try {
      if (userForm.id) {
        await apiPatch(`/api/admin/users/${userForm.id}`, {
          name: userForm.name.trim(),
          role: userForm.role,
          is_active: userForm.is_active,
          password: userForm.password || undefined,
        });
        pushToast({ message: "Usuario actualizado correctamente" });
      } else {
        await apiPost("/api/admin/users", {
          name: userForm.name.trim(),
          email: userForm.email.trim().toLowerCase(),
          role: userForm.role,
          password: userForm.password,
        });
        pushToast({ message: "Usuario creado correctamente" });
      }
      setUserForm({
        id: "",
        name: "",
        email: "",
        role: "recepcion",
        password: "",
        is_active: true,
      });
      await loadAdminUsers();
    } catch (error) {
      setPageError(normalizeError(error));
      pushToast({ type: "error", message: normalizeError(error) || "Error al guardar usuario" });
    }
  }

  async function handleUserDelete(userId) {
    if (!userId) {
      return;
    }
    if (pendingUserDeletesRef.current.has(userId)) {
      return;
    }
    let snapshot = null;
    try {
      snapshot = adminUsers.slice();
      setAdminUsers((prev) => prev.filter((user) => user.id !== userId));
      const timer = setTimeout(async () => {
        try {
          await apiDelete(`/api/admin/users/${userId}`);
          await loadAdminUsers();
          pushToast({ message: "Usuario eliminado definitivamente" });
        } catch (err) {
          if (snapshot) {
            setAdminUsers(snapshot);
          } else {
            await loadAdminUsers();
          }
          pushToast({
            type: "error",
            message: normalizeError(err) || "No se pudo eliminar el usuario",
          });
        } finally {
          pendingUserDeletesRef.current.delete(userId);
        }
      }, 8000);
      pendingUserDeletesRef.current.set(userId, { timer, snapshot });
      pushToast({
        message: "Usuario eliminado. Deshacer disponible",
        actionLabel: "DESHACER",
        duration: 8000,
        onAction: async () => {
          const pending = pendingUserDeletesRef.current.get(userId);
          if (pending?.timer) {
            clearTimeout(pending.timer);
          }
          if (pending?.snapshot) {
            setAdminUsers(pending.snapshot);
          } else if (snapshot) {
            setAdminUsers(snapshot);
          } else {
            await loadAdminUsers();
          }
          pendingUserDeletesRef.current.delete(userId);
          pushToast({ message: "Eliminación cancelada" });
        },
      });
    } catch (error) {
      setPageError(normalizeError(error));
      pushToast({ type: "error", message: normalizeError(error) || "Error al eliminar usuario" });
    }
  }

  async function loadSettings() {
    try {
      const data = await apiGet("/api/admin/settings");
      setSettings(data.settings);
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function handleSaveSettings() {
    if (!settings) {
      return;
    }
    try {
      const data = await apiPatch("/api/admin/settings", {
        bot_enabled: settings.bot_enabled,
        auto_reply_enabled: settings.auto_reply_enabled,
      });
      setSettings(data.settings);
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function loadCatalog() {
    try {
      const [branchData, serviceData] = await Promise.all([
        apiGet("/api/admin/branches"),
        apiGet("/api/admin/services"),
      ]);
      setBranches(branchData.branches || []);
      setServices(serviceData.services || []);
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function loadTenantChannels() {
    try {
      const data = await apiGet("/api/channels");
      setTenantChannels(data.channels || []);
    } catch (error) {
      setTenantChannels([]);
    }
  }

  function handleChannelSelect(channel) {
    setChannelForm({
      id: channel.id,
      display_name: channel.display_name || "",
    });
  }

  async function handleChannelSubmit(event) {
    event.preventDefault();
    if (!channelForm.id) {
      return;
    }
    try {
      await apiPatch(`/api/channels/${channelForm.id}`, {
        display_name: channelForm.display_name.trim(),
      });
      setChannelForm({ id: "", display_name: "" });
      await loadTenantChannels();
      pushToast({ message: "Canal actualizado correctamente" });
    } catch (error) {
      setPageError(normalizeError(error));
      pushToast({ type: "error", message: normalizeError(error) || "Error al guardar canal" });
    }
  }

  async function handleRoleDelete(role) {
    const currentPermissions = rolePermissions?.[role];
    if (!role || pendingRoleDeletesRef.current.has(role)) {
      return;
    }
    try {
      setRolePermissions((prev) => {
        const next = { ...prev };
        delete next[role];
        return next;
      });
      const timer = setTimeout(async () => {
        try {
          await apiDelete(`/api/admin/role-permissions/${role}`);
          pushToast({ message: "Rol eliminado definitivamente" });
        } catch (err) {
          if (currentPermissions) {
            setRolePermissions((prev) => ({ ...prev, [role]: currentPermissions }));
          }
          pushToast({
            type: "error",
            message: normalizeError(err) || "No se pudo eliminar el rol",
          });
        } finally {
          pendingRoleDeletesRef.current.delete(role);
        }
      }, 8000);
      pendingRoleDeletesRef.current.set(role, { timer, currentPermissions });
      pushToast({
        message: "Rol eliminado. Deshacer disponible",
        actionLabel: "DESHACER",
        duration: 8000,
        onAction: async () => {
          const pending = pendingRoleDeletesRef.current.get(role);
          if (pending?.timer) {
            clearTimeout(pending.timer);
          }
          if (pending?.currentPermissions) {
            setRolePermissions((prev) => ({ ...prev, [role]: pending.currentPermissions }));
          }
          pendingRoleDeletesRef.current.delete(role);
          pushToast({ message: "Eliminación cancelada" });
        },
      });
    } catch (error) {
      setPageError(normalizeError(error));
      pushToast({ type: "error", message: normalizeError(error) || "Error al eliminar rol" });
    }
  }

  async function handleBranchSubmit(event) {
    event.preventDefault();
    if (!branchForm.code.trim() || !branchForm.name.trim()) {
      setPageError("Completa codigo y nombre");
      return;
    }
    const payload = {
      code: branchForm.code.trim(),
      name: branchForm.name.trim(),
      address: branchForm.address.trim(),
      lat: branchForm.lat !== "" ? Number(branchForm.lat) : 0,
      lng: branchForm.lng !== "" ? Number(branchForm.lng) : 0,
      hours_text: branchForm.hours_text.trim(),
      phone: branchForm.phone.trim() || null,
      is_active: branchForm.is_active,
    };
    try {
      if (branchForm.id) {
        await apiPatch(`/api/admin/branches/${branchForm.id}`, payload);
        pushToast({ message: "Sucursal actualizada correctamente" });
      } else {
        await apiPost("/api/admin/branches", payload);
        pushToast({ message: "Sucursal creada correctamente" });
      }
      setBranchForm({
        id: "",
        code: "",
        name: "",
        address: "",
        lat: "",
        lng: "",
        hours_text: "",
        phone: "",
        is_active: true,
      });
      await loadCatalog();
    } catch (error) {
      setPageError(normalizeError(error));
      pushToast({ type: "error", message: normalizeError(error) || "Error al guardar sucursal" });
    }
  }

  async function handleBranchDisable(branchId) {
    try {
      await apiDelete(`/api/admin/branches/${branchId}`);
      await loadCatalog();
      pushToast({
        message: "Sucursal eliminada correctamente",
        actionLabel: "DESHACER",
        duration: 8000,
        onAction: async () => {
          try {
            await apiPatch(`/api/admin/branches/${branchId}`, { is_active: true });
            await loadCatalog();
            pushToast({ message: "Sucursal restaurada" });
          } catch (err) {
            pushToast({
              type: "error",
              message: normalizeError(err) || "No se pudo restaurar la sucursal",
            });
          }
        },
      });
    } catch (error) {
      setPageError(normalizeError(error));
      pushToast({ type: "error", message: normalizeError(error) || "Error al eliminar sucursal" });
    }
  }

  async function handleServiceSubmit(event) {
    event.preventDefault();
    if (!serviceForm.code.trim() || !serviceForm.name.trim()) {
      setPageError("Completa codigo y nombre");
      return;
    }
    const payload = {
      code: serviceForm.code.trim(),
      name: serviceForm.name.trim(),
      subtitle: serviceForm.subtitle.trim() || null,
      description: serviceForm.description.trim(),
      price_bob: serviceForm.price_bob ? Number(serviceForm.price_bob) : 0,
      duration_min: serviceForm.duration_min
        ? Number(serviceForm.duration_min)
        : null,
      image_url: serviceForm.image_url.trim() || null,
      is_featured: serviceForm.is_featured,
      is_active: serviceForm.is_active,
    };
    try {
      if (serviceForm.id) {
        await apiPatch(`/api/admin/services/${serviceForm.id}`, payload);
        pushToast({ message: "Servicio actualizado correctamente" });
      } else {
        await apiPost("/api/admin/services", payload);
        pushToast({ message: "Servicio creado correctamente" });
      }
      setServiceForm({
        id: "",
        code: "",
        name: "",
        subtitle: "",
        description: "",
        price_bob: "",
        duration_min: "",
        image_url: "",
        is_featured: false,
        is_active: true,
      });
      await loadCatalog();
    } catch (error) {
      setPageError(normalizeError(error));
      pushToast({ type: "error", message: normalizeError(error) || "Error al guardar servicio" });
    }
  }

  async function handleServiceDisable(serviceId) {
    try {
      await apiDelete(`/api/admin/services/${serviceId}`);
      await loadCatalog();
      pushToast({
        message: "Servicio eliminado correctamente",
        actionLabel: "DESHACER",
        duration: 8000,
        onAction: async () => {
          try {
            await apiPatch(`/api/admin/services/${serviceId}`, { is_active: true });
            await loadCatalog();
            pushToast({ message: "Servicio restaurado" });
          } catch (err) {
            pushToast({
              type: "error",
              message: normalizeError(err) || "No se pudo restaurar el servicio",
            });
          }
        },
      });
    } catch (error) {
      setPageError(normalizeError(error));
      pushToast({ type: "error", message: normalizeError(error) || "Error al eliminar servicio" });
    }
  }

  async function handleServiceBranchToggle(service, branchId, isAvailable) {
    if (!service) {
      return;
    }
    try {
      await apiPost(`/api/admin/services/${service.id}/branches`, {
        branch_id: branchId,
        is_available: isAvailable,
      });
      await loadCatalog();
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function handleTemplateSubmit(event, overrideData) {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    const data = overrideData || templateForm || {};
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (!name) {
      setPageError("Completa el nombre");
      return null;
    }
    const payload = {
      name,
      category: data.category || "UTILITY",
      language: data.language || "es",
      body_text: data.body_text || data.body_preview || "",
      header_type: data.header_type || null,
      header_content: data.header_content || null,
      footer_text: data.footer_text || null,
      buttons: data.buttons || data.buttons_json || [],
    };
    const variableMappings = data.variable_mappings || data.variableMappings || [];
    try {
      let result = null;
      if (data.id) {
        result = await apiPut(`/api/templates/${data.id}`, payload);
        await apiPut(`/api/templates/${data.id}/mappings`, {
          mappings: variableMappings,
        });
        pushToast({ message: "Borrador actualizado correctamente" });
      } else {
        result = await apiPost("/api/templates/draft", {
          ...payload,
          variable_mappings: variableMappings,
        });
        pushToast({ message: "Borrador creado correctamente" });
      }
      await loadTemplates();
      return result?.template || null;
    } catch (error) {
      setPageError(normalizeError(error));
      pushToast({ type: "error", message: normalizeError(error) || "Error al guardar plantilla" });
      return null;
    }
  }

  async function handleTemplateSubmitToMeta(templateId) {
    if (!templateId) {
      return;
    }
    try {
      await apiPost(`/api/templates/${templateId}/submit`, {});
      await loadTemplates();
      pushToast({ message: "Plantilla enviada a revisión de Meta" });
    } catch (error) {
      setPageError(normalizeError(error));
      pushToast({ type: "error", message: normalizeError(error) || "Error al enviar a Meta" });
    }
  }

  async function handleTemplateDelete(templateId) {
    if (!templateId) {
      return;
    }
    if (pendingTemplateDeletesRef.current.has(templateId)) {
      return;
    }
    try {
      const snapshot = templates.slice();
      setTemplates((prev) => prev.filter((template) => template.id !== templateId));
      const timer = setTimeout(async () => {
        try {
          await apiDelete(`/api/templates/${templateId}`);
          await loadTemplates();
          pushToast({ message: "Plantilla eliminada definitivamente" });
        } catch (err) {
          setTemplates(snapshot);
          pushToast({
            type: "error",
            message: normalizeError(err) || "No se pudo eliminar la plantilla",
          });
        } finally {
          pendingTemplateDeletesRef.current.delete(templateId);
        }
      }, 8000);
      pendingTemplateDeletesRef.current.set(templateId, { timer, snapshot });
      pushToast({
        message: "Plantilla eliminada. Deshacer disponible",
        actionLabel: "DESHACER",
        duration: 8000,
        onAction: async () => {
          const pending = pendingTemplateDeletesRef.current.get(templateId);
          if (pending?.timer) {
            clearTimeout(pending.timer);
          }
          if (pending?.snapshot) {
            setTemplates(pending.snapshot);
          } else {
            setTemplates(snapshot);
          }
          pendingTemplateDeletesRef.current.delete(templateId);
          pushToast({ message: "Eliminación cancelada" });
        },
      });
    } catch (error) {
      setPageError(normalizeError(error));
      pushToast({ type: "error", message: normalizeError(error) || "Error al eliminar plantilla" });
    }
  }

  async function loadAuditLogs() {
    try {
      const data = await apiGet("/api/admin/audit?limit=200");
      setAuditLogs(data.logs || []);
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  const statusCounts = { open: 0, pending: 0, closed: 0 };
  (metrics?.status_counts || []).forEach((item) => {
    statusCounts[item.status] = item._count.status;
  });
  const loginSubtitle = isSuperAdminRoute
    ? "Acceso al control plane"
    : "Acceso a bandeja multiusuario";

  if (!token || !user) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="login-title">Perzivalh</div>
          <div className="login-subtitle">{loginSubtitle}</div>
          {isOffline ? (
            <NoticeBanner
              variant="offline"
              title="Sin conexión"
              message="No tienes internet en este momento. Conéctate y vuelve a intentar iniciar sesión."
              actionLabel="Reintentar"
              onAction={() => window.location.reload()}
            />
          ) : null}
          <form className="login-form" onSubmit={handleLogin}>
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

  if (user?.role === "superadmin" && isSuperAdminRoute) {
    return (
      <main className="superadmin-page">
        <SuperAdminView
          route={pathname}
          onNavigate={navigateTo}
          onImpersonateTenant={handleImpersonateTenant}
          onLogout={handleLogout}
        />
      </main>
    );
  }

  const roleAccess =
    rolePermissions?.[user.role] || DEFAULT_ROLE_PERMISSIONS[user.role];
  const canViewChats = hasPermission(roleAccess, "modules", "chat");
  const canViewDashboard = hasPermission(roleAccess, "modules", "dashboard");
  const canViewCampaigns = hasPermission(roleAccess, "modules", "campaigns");
  const canViewAdmin = hasPermission(roleAccess, "modules", "settings");
  const isAdmin = hasRole(user, ["admin"]);
  const canManageStatus = hasPermission(roleAccess, "modules", "chat", "write");
  const quickActions = [];
  const statusLabels = {
    open: "Bot activo",
    pending: "Pendiente",
    assigned: "Tomada",
  };
  const activeName = activeConversation
    ? activeConversation.display_name ||
    activeConversation.phone_e164 ||
    activeConversation.wa_id
    : "Selecciona un chat";
  const activePhone = activeConversation?.phone_e164 || activeConversation?.wa_id || "";
  const activeStatusLabel = activeConversation
    ? statusLabels[activeConversation.status] || "Sin estado"
    : "";
  const navItems = [
    { id: "chats", label: "Chats", icon: ChatIcon, enabled: canViewChats },
    {
      id: "dashboard",
      label: "Dashboard",
      icon: DashboardIcon,
      enabled: canViewDashboard,
    },
    {
      id: "campaigns",
      label: "Campañas",
      icon: BellIcon,
      enabled: canViewCampaigns,
    },
    {
      id: "admin",
      label: "Configuraciones",
      icon: SettingsIcon,
      enabled: canViewAdmin,
    },
  ];
  const messageBlocks = [];
  let lastDayKey = "";
  messages.forEach((message) => {
    const createdAt = message.created_at;
    const date = createdAt ? new Date(createdAt) : null;
    const dayKey = date && !Number.isNaN(date.getTime())
      ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      : "";
    if (dayKey && dayKey !== lastDayKey) {
      const dayLabel = formatMessageDayLabel(createdAt);
      messageBlocks.push(
        <div className="day-pill" data-day-label={dayLabel} key={`day-${dayKey}`}>
          {dayLabel}
        </div>
      );
      lastDayKey = dayKey;
    }
    messageBlocks.push(
      <div
        key={message.id}
        className={`message ${message.direction} ${message.type === "note" ? "note" : ""
          }`}
        data-day-key={dayKey}
        data-day-label={dayKey ? formatMessageDayLabel(createdAt) : ""}
      >
        <div className="message-text">{message.text || `[${message.type}]`}</div>
        <div className="message-meta">{formatDate(message.created_at)}</div>
      </div>
    );
  });

  const canReturnToSuperadmin = Boolean(superadminToken) && user.role !== "superadmin";

  return (
    <div className={`app-shell ${view === "admin" ? "admin-shell" : ""}`}>
      <NavRail
        navItems={navItems}
        view={view}
        onSetView={setView}
        theme={theme}
        onToggleTheme={toggleTheme}
        user={user}
        logoUrl={branding?.logo_url || ""}
        brandName={displayBrandName}
        isProfileOpen={isProfileOpen}
        onToggleProfile={() => setIsProfileOpen((prev) => !prev)}
        onLogout={handleLogout}
        onReturnToSuperadmin={handleReturnToSuperadmin}
        showReturnToSuperadmin={canReturnToSuperadmin}
        getInitial={getInitial}
        SunIcon={SunIcon}
        MoonIcon={MoonIcon}
      />

      {view === "admin" ? (
        <AdminView
          settingsSection={settingsSection}
          setSettingsSection={setSettingsSection}
          settingsTab={settingsTab}
          setSettingsTab={setSettingsTab}
          rolePermissions={rolePermissions}
          setRolePermissions={handleRolePermissionsUpdate}
          defaultRolePermissions={DEFAULT_ROLE_PERMISSIONS}
          currentRole={user.role}
          isAdmin={isAdmin}
          adminUsers={adminUsers}
          userForm={userForm}
          setUserForm={setUserForm}
          roleOptions={roleOptions}
          handleUserSubmit={handleUserSubmit}
          handleUserDelete={handleUserDelete}
          settings={settings}
          setSettings={setSettings}
          handleSaveSettings={handleSaveSettings}
          planName={tenantMeta?.plan || ""}
          branches={branches}
          services={services}
          branchForm={branchForm}
          setBranchForm={setBranchForm}
          handleBranchSubmit={handleBranchSubmit}
          handleBranchDisable={handleBranchDisable}
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
          handleRoleDelete={handleRoleDelete}
          templates={templates}
          templateForm={templateForm}
          setTemplateForm={setTemplateForm}
          handleTemplateSubmit={handleTemplateSubmit}
          handleTemplateSubmitToMeta={handleTemplateSubmitToMeta}
          handleTemplateDelete={handleTemplateDelete}
          handleSyncTemplates={handleSyncTemplates}
          auditLogs={auditLogs}
          formatDate={formatDate}
          useShellLayout
          pageError={pageError}
          isOffline={isOffline}
          onDismissError={() => setPageError("")}
          brandName={displayBrandName}
        />
      ) : view === "superadmin" ? (
        <main className="content content-page">
          <SuperAdminView
            onImpersonateTenant={handleImpersonateTenant}
            onLogout={handleLogout}
          />
        </main>
      ) : (
        <main
          className={`content ${view === "chats" ? "content-chats" : "content-page"}`}
        >
          {view === "chats" && (
              <ChatView
                activeConversation={activeConversation}
                conversations={conversations}
                channels={tenantChannels}
                brandName={displayBrandName}
                lastReadMap={lastReadMap}
                filters={filters}
                showFilters={showFilters}
                users={users}
                tags={tags}
                statusOptions={STATUS_OPTIONS}
                statusLabels={statusLabels}
                formatListTime={formatListTime}
                messageBlocks={messageBlocks}
                messageDraft={messageDraft}
                messageMode={messageMode}
                quickActions={quickActions}
                tagInput={tagInput}
                noteInput={noteInput}
                notesList={notesList}
                latestNote={latestNote}
                loadingConversation={loadingConversation}
                isInfoOpen={isInfoOpen}
                hasUnread={hasUnread}
                scrollDayLabel={scrollDayLabel}
                activeName={activeName}
                activePhone={activePhone}
                activeStatusLabel={activeStatusLabel}
                canManageStatus={canManageStatus}
                currentUser={user}
                messageInputRef={messageInputRef}
                chatBodyRef={chatBodyRef}
                setShowFilters={setShowFilters}
                setFilters={setFilters}
                loadConversation={loadConversation}
                handleBackToList={handleBackToList}
                setIsInfoOpen={setIsInfoOpen}
                handleChatScroll={handleChatScroll}
                handleAssignSelf={handleAssignSelf}
                handleStatusChange={handleStatusChange}
                handleToggleTag={handleToggleTag}
                handleAddTag={handleAddTag}
                setNoteInput={setNoteInput}
                handleAddNote={handleAddNote}
                reassignUserId={reassignUserId}
                setReassignUserId={setReassignUserId}
                handleReassignConversation={handleReassignConversation}
                handleOpenTagManager={() => setShowTagManager(true)}
                handleCloseTagManager={() => setShowTagManager(false)}
                showTagManager={showTagManager}
                tagManagerForm={tagManagerForm}
                setTagManagerForm={setTagManagerForm}
                handleCreateTag={handleCreateTag}
                handleDeleteTag={handleDeleteTag}
                handleQuickAction={handleQuickAction}
                handleSendMessage={handleSendMessage}
                setMessageMode={setMessageMode}
                setMessageDraft={setMessageDraft}
                scrollChatToBottom={scrollChatToBottom}
                getInitial={getInitial}
                PlusIcon={PlusIcon}
                SearchIcon={SearchIcon}
                VideoIcon={VideoIcon}
                PhoneIcon={PhoneIcon}
                InfoIcon={InfoIcon}
                SendIcon={SendIcon}
              />
          )}
          {view === "dashboard" && (
            <DashboardView
              statusCounts={statusCounts}
              metrics={metrics}
              onRefresh={loadMetrics}
              brandName={displayBrandName}
            />
          )}
          {view === "campaigns" && (
            <CampaignsView
              campaignForm={campaignForm}
              setCampaignForm={setCampaignForm}
              campaignFilter={campaignFilter}
              setCampaignFilter={setCampaignFilter}
              templates={templates}
              campaigns={campaigns}
              selectedCampaignId={selectedCampaignId}
              campaignMessages={campaignMessages}
              users={users}
              tags={tags}
              selectedTemplate={selectedTemplate}
              statusOptions={STATUS_OPTIONS}
              onCreateCampaign={handleCreateCampaign}
              onLoadCampaigns={loadCampaigns}
              onLoadCampaignMessages={loadCampaignMessages}
              onSendCampaign={handleSendCampaign}
              formatDate={formatDate}
              brandName={displayBrandName}
            />
          )}

          {isOffline ? (
            <NoticeBanner
              variant="offline"
              title="Sin conexión"
              message="No podemos actualizar la información en tiempo real. Te mostramos lo último cargado."
              actionLabel="Reintentar"
              onAction={() => window.location.reload()}
            />
          ) : pageError ? (
            <NoticeBanner
              variant="error"
              title="Ocurrió un problema"
              message={pageError}
              dismissLabel="Cerrar"
              onDismiss={() => setPageError("")}
            />
          ) : null}
        </main>
      )}
    </div>
  );
}

export default App;
