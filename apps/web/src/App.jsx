
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, setToken } from "./api";
import { connectSocket } from "./socket";
import NavRail from "./components/NavRail.jsx";
import ChatView from "./components/ChatView.jsx";
import DashboardView from "./components/DashboardView.jsx";
import CampaignsView from "./components/CampaignsView.jsx";
import AdminView from "./components/AdminView.jsx";
import SuperAdminView from "./components/SuperAdminView.jsx";
import TemplatesView from "./components/TemplatesView.jsx";
import TemplateEditorView from "./components/TemplateEditorView.jsx";

// Importar desde módulos
import { STATUS_OPTIONS, BASE_ROLE_OPTIONS, DEFAULT_ROLE_PERMISSIONS } from "./constants";
import {
  formatDate,
  formatCompactDate,
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
  const [showFilters, setShowFilters] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(
    false
  );
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasUnread, setHasUnread] = useState(false);
  const messageInputRef = useRef(null);
  const chatBodyRef = useRef(null);
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
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [pageError, setPageError] = useState("");

  const [metrics, setMetrics] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignMessages, setCampaignMessages] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [selectedTemplateForEdit, setSelectedTemplateForEdit] = useState(null);
  const [audiences, setAudiences] = useState([]);
  const [contactStats, setContactStats] = useState(null);
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    template_id: "",
    scheduled_for: "",
  });
  const [campaignFilter, setCampaignFilter] = useState({
    status: "",
    tag: "",
    assigned_user_id: "",
    verified_only: false,
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
      return;
    }
    if (isAtBottom) {
      scrollChatToBottom();
    } else {
      setHasUnread(true);
    }
  }, [messages, activeConversation?.id, isAtBottom]);

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
      void loadCampaigns();
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
    socket.on("conversation:update", ({ conversation }) => {
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
    setLoadingConversation(true);
    try {
      const data = await apiGet(`/api/conversations/${conversationId}`);
      setActiveConversation(data.conversation);
      setMessages(data.messages || []);
      markConversationRead(data.conversation);
    } catch (error) {
      setPageError(normalizeError(error));
    } finally {
      setLoadingConversation(false);
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
  }

  function handleBackToList() {
    setActiveConversation(null);
    setMessages([]);
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

  async function handleAssignSelf() {
    if (!activeConversation) {
      return;
    }
    try {
      const data = await apiPost(`/api/conversations/${activeConversation.id}/assign`);
      setActiveConversation(data.conversation);
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function handleStatusChange(status) {
    if (!activeConversation) {
      return;
    }
    try {
      const data = await apiPost(`/api/conversations/${activeConversation.id}/status`, {
        status,
      });
      setActiveConversation(data.conversation);
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

  async function loadCampaigns() {
    try {
      const data = await apiGet("/api/admin/campaigns");
      setCampaigns(data.campaigns || []);
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
    try {
      await apiPost("/api/admin/campaigns", {
        name: campaignForm.name.trim(),
        template_id: campaignForm.template_id,
        audience_filter: filter,
        scheduled_for: campaignForm.scheduled_for || null,
      });
      setCampaignForm({ name: "", template_id: "", scheduled_for: "" });
      setCampaignFilter({
        status: "",
        tag: "",
        assigned_user_id: "",
        verified_only: false,
      });
      await loadCampaigns();
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function handleSendCampaign(campaignId) {
    try {
      await apiPost(`/api/admin/campaigns/${campaignId}/send`, {});
      await loadCampaigns();
    } catch (error) {
      setPageError(normalizeError(error));
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
      } else {
        await apiPost("/api/admin/users", {
          name: userForm.name.trim(),
          email: userForm.email.trim().toLowerCase(),
          role: userForm.role,
          password: userForm.password,
        });
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
    }
  }

  async function handleUserDelete(userId) {
    if (!userId) {
      return;
    }
    try {
      await apiDelete(`/api/admin/users/${userId}`);
      await loadAdminUsers();
    } catch (error) {
      setPageError(normalizeError(error));
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
    } catch (error) {
      setPageError(normalizeError(error));
    }
  }

  async function handleRoleDelete(role) {
    try {
      await apiDelete(`/api/admin/role-permissions/${role}`);
      setRolePermissions((prev) => {
        const next = { ...prev };
        delete next[role];
        return next;
      });
    } catch (error) {
      setPageError(normalizeError(error));
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
      } else {
        await apiPost("/api/admin/branches", payload);
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
    }
  }

  async function handleBranchDisable(branchId) {
    try {
      await apiDelete(`/api/admin/branches/${branchId}`);
      await loadCatalog();
    } catch (error) {
      setPageError(normalizeError(error));
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
      } else {
        await apiPost("/api/admin/services", payload);
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
    }
  }

  async function handleServiceDisable(serviceId) {
    try {
      await apiDelete(`/api/admin/services/${serviceId}`);
      await loadCatalog();
    } catch (error) {
      setPageError(normalizeError(error));
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
      } else {
        result = await apiPost("/api/templates/draft", {
          ...payload,
          variable_mappings: variableMappings,
        });
      }
      await loadTemplates();
      return result?.template || null;
    } catch (error) {
      setPageError(normalizeError(error));
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
    } catch (error) {
      setPageError(normalizeError(error));
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
  const quickActions = ["Confirmar Cita", "Solicitar Resultados", "Urgencia"];
  const statusLabels = {
    open: "Abierto",
    pending: "Pendiente",
    closed: "Cerrado",
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
      label: "Campanas",
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
      messageBlocks.push(
        <div className="day-pill" key={`day-${dayKey}`}>
          {formatMessageDayLabel(createdAt)}
        </div>
      );
      lastDayKey = dayKey;
    }
    messageBlocks.push(
      <div
        key={message.id}
        className={`message ${message.direction} ${message.type === "note" ? "note" : ""
          }`}
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
        brandName={branding?.brand_name || ""}
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
          handleSyncTemplates={handleSyncTemplates}
          auditLogs={auditLogs}
          formatDate={formatDate}
          useShellLayout
          pageError={pageError}
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
              brandName={branding?.brand_name || ""}
              lastReadMap={lastReadMap}
              filters={filters}
              showFilters={showFilters}
              users={users}
              tags={tags}
              statusOptions={STATUS_OPTIONS}
              statusLabels={statusLabels}
              formatListTime={formatListTime}
              formatCompactDate={formatCompactDate}
              messageBlocks={messageBlocks}
              messageDraft={messageDraft}
              messageMode={messageMode}
              quickActions={quickActions}
              tagInput={tagInput}
              latestNote={latestNote}
              loadingConversation={loadingConversation}
              isInfoOpen={isInfoOpen}
              hasUnread={hasUnread}
              activeName={activeName}
              activePhone={activePhone}
              activeStatusLabel={activeStatusLabel}
              canManageStatus={canManageStatus}
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
            />
          )}

          {pageError && <div className="error-banner">{pageError}</div>}
        </main>
      )}
    </div>
  );
}

export default App;
