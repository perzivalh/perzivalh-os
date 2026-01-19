
import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost, setToken } from "./api";
import { connectSocket } from "./socket";
import NavRail from "./components/NavRail.jsx";
import ChatView from "./components/ChatView.jsx";
import DashboardView from "./components/DashboardView.jsx";
import CampaignsView from "./components/CampaignsView.jsx";
import AdminView from "./components/AdminView.jsx";

const STATUS_OPTIONS = ["open", "pending", "closed"];
const ROLE_OPTIONS = ["admin", "recepcion", "caja", "marketing", "doctor"];
const DEFAULT_ROLE_PERMISSIONS = {
  admin: {
    modules: {
      chat: { read: true, write: true },
      dashboard: { read: true, write: true },
      campaigns: { read: true, write: true },
      settings: { read: true, write: true },
    },
    settings: {
      general: { read: true, write: true },
      users: { read: true, write: true },
      bot: { read: true, write: true },
      templates: { read: true, write: true },
      audit: { read: true, write: true },
      odoo: { read: true, write: true },
    },
  },
  recepcion: {
    modules: {
      chat: { read: true, write: true },
      dashboard: { read: true, write: false },
      campaigns: { read: false, write: false },
      settings: { read: false, write: false },
    },
    settings: {
      general: { read: false, write: false },
      users: { read: false, write: false },
      bot: { read: false, write: false },
      templates: { read: false, write: false },
      audit: { read: false, write: false },
      odoo: { read: false, write: false },
    },
  },
  caja: {
    modules: {
      chat: { read: true, write: false },
      dashboard: { read: true, write: false },
      campaigns: { read: false, write: false },
      settings: { read: false, write: false },
    },
    settings: {
      general: { read: false, write: false },
      users: { read: false, write: false },
      bot: { read: false, write: false },
      templates: { read: false, write: false },
      audit: { read: false, write: false },
      odoo: { read: false, write: false },
    },
  },
  marketing: {
    modules: {
      chat: { read: false, write: false },
      dashboard: { read: true, write: false },
      campaigns: { read: true, write: true },
      settings: { read: true, write: false },
    },
    settings: {
      general: { read: true, write: false },
      users: { read: false, write: false },
      bot: { read: false, write: false },
      templates: { read: true, write: true },
      audit: { read: false, write: false },
      odoo: { read: false, write: false },
    },
  },
  doctor: {
    modules: {
      chat: { read: true, write: false },
      dashboard: { read: false, write: false },
      campaigns: { read: false, write: false },
      settings: { read: false, write: false },
    },
    settings: {
      general: { read: false, write: false },
      users: { read: false, write: false },
      bot: { read: false, write: false },
      templates: { read: false, write: false },
      audit: { read: false, write: false },
      odoo: { read: false, write: false },
    },
  },
};

function formatDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
}

function formatCompactDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleDateString();
}

function formatListTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today - target) / 86400000);
  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) {
    return "Ayer";
  }
  const dayNames = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
  return dayNames[date.getDay()];
}

function formatMessageDayLabel(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today - target) / 86400000);
  if (diffDays === 0) {
    return "Hoy";
  }
  if (diffDays === 1) {
    return "Ayer";
  }
  const months = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];
  const label = `${date.getDate()} ${months[date.getMonth()]}`;
  if (date.getFullYear() !== now.getFullYear()) {
    return `${label} ${date.getFullYear()}`;
  }
  return label;
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) {
    return "-";
  }
  const minutes = Math.round(Number(seconds) / 60);
  if (!Number.isFinite(minutes)) {
    return "-";
  }
  return `${minutes} min`;
}

function normalizeError(error) {
  if (!error) {
    return "Error inesperado";
  }
  if (typeof error === "string") {
    return error;
  }
  return error.message || "Error inesperado";
}

function sortConversations(list) {
  return [...list].sort((a, b) => {
    const aTime = new Date(a.last_message_at || a.created_at || 0).getTime();
    const bTime = new Date(b.last_message_at || b.created_at || 0).getTime();
    return bTime - aTime;
  });
}

function buildQuery(params) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    search.append(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

function hasRole(user, roles) {
  if (!user) {
    return false;
  }
  return roles.includes(user.role);
}

function getInitial(value) {
  if (!value) {
    return "?";
  }
  const trimmed = value.trim();
  return trimmed ? trimmed[0].toUpperCase() : "?";
}

function mergeRolePermissions(saved) {
  if (!saved || typeof saved !== "object") {
    return { ...DEFAULT_ROLE_PERMISSIONS };
  }
  const merged = { ...DEFAULT_ROLE_PERMISSIONS };
  Object.entries(saved).forEach(([role, value]) => {
    if (!value || typeof value !== "object") {
      return;
    }
    merged[role] = {
      modules: {
        ...DEFAULT_ROLE_PERMISSIONS[role]?.modules,
        ...value.modules,
      },
      settings: {
        ...DEFAULT_ROLE_PERMISSIONS[role]?.settings,
        ...value.settings,
      },
    };
  });
  return merged;
}

function hasPermission(rolePermissions, group, key, action = "read") {
  const entry = rolePermissions?.[group]?.[key];
  if (!entry) {
    return false;
  }
  return Boolean(entry[action]);
}

function ChatIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path
        d="M4.5 5.5h15v10H8l-3.5 3.5V5.5Z"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8 9h8" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 12.5h5" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function DashboardIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.6" strokeWidth="1.8" />
      <rect x="14" y="3" width="7" height="7" rx="1.6" strokeWidth="1.8" />
      <rect x="3" y="14" width="7" height="7" rx="1.6" strokeWidth="1.8" />
      <rect x="14" y="14" width="7" height="7" rx="1.6" strokeWidth="1.8" />
    </svg>
  );
}

function BellIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path
        d="M6 9a6 6 0 1 1 12 0c0 4.2 2 5.5 2 5.5H4S6 13.2 6 9Z"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9.5 19a2.5 2.5 0 0 0 5 0" strokeWidth="1.8" />
    </svg>
  );
}

function SettingsIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <circle cx="12" cy="12" r="3.2" strokeWidth="1.8" />
      <path
        d="M19.5 12a7.5 7.5 0 0 0-.1-1.2l2-1.4-2-3.4-2.3.8a7.5 7.5 0 0 0-1.8-1L14.9 2h-3.8l-.4 2.8a7.5 7.5 0 0 0-1.8 1l-2.3-.8-2 3.4 2 1.4a7.5 7.5 0 0 0 0 2.4l-2 1.4 2 3.4 2.3-.8a7.5 7.5 0 0 0 1.8 1l.4 2.8h3.8l.4-2.8a7.5 7.5 0 0 0 1.8-1l2.3.8 2-3.4-2-1.4c.1-.4.1-.8.1-1.2Z"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SunIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <circle cx="12" cy="12" r="4" strokeWidth="1.8" />
      <path d="M12 3v2.5" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 18.5V21" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3 12h2.5" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18.5 12H21" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5.2 5.2l1.8 1.8" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17 17l1.8 1.8" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5.2 18.8 7 17" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17 7l1.8-1.8" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path
        d="M20 14.2A8.5 8.5 0 1 1 9.8 4 6.5 6.5 0 0 0 20 14.2Z"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UserIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <circle cx="12" cy="8" r="3.5" strokeWidth="1.8" />
      <path
        d="M5 19.5a7 7 0 0 1 14 0"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SearchIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <circle cx="11" cy="11" r="6.5" strokeWidth="1.8" />
      <path d="M16.5 16.5 21 21" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path d="M12 5v14" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 12h14" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function VideoIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <rect x="3.5" y="6" width="11" height="12" rx="2" strokeWidth="1.8" />
      <path d="m14.5 10 6-3v10l-6-3" strokeWidth="1.8" />
    </svg>
  );
}

function PhoneIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path
        d="M6.5 4.5 9 3l2.5 4-2.5 1.5c1.2 2.3 3.2 4.3 5.5 5.5L16 11l4 2.5-1.5 2.5c-.7 1.2-2.2 1.7-3.6 1.3a15.9 15.9 0 0 1-7.7-7.7c-.4-1.4.1-2.9 1.3-3.6Z"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InfoIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <circle cx="12" cy="12" r="9" strokeWidth="1.8" />
      <path d="M12 10v6" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="7.5" r="1" fill="currentColor" />
    </svg>
  );
}

function SendIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path
        d="m4 12 15-7-6 14-2.5-5.2L4 12Z"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function App() {
  const [token, setTokenState] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [view, setView] = useState("chats");
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || "light"
  );
  const [showFilters, setShowFilters] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(
    () => (typeof window !== "undefined" ? window.innerWidth >= 1024 : true)
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

  const [filters, setFilters] = useState({
    status: "",
    assigned_user_id: "",
    tag: "",
    search: "",
  });
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

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === campaignForm.template_id),
    [templates, campaignForm.template_id]
  );
  const latestNote = useMemo(() => {
    const note = [...messages].reverse().find((message) => message.type === "note");
    return note?.text || "";
  }, [messages]);

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
  }, [activeConversation?.id]);

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
    if (!user) {
      return;
    }
    void loadUsers();
    void loadTags();
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }
    void loadRolePermissions();
  }, [user]);

  useEffect(() => {
    if (!user || view !== "chats") {
      return;
    }
    void loadConversations();
  }, [user, view, filters]);

  useEffect(() => {
    if (!user) {
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
      setView("chats");
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
    const socket = connectSocket(token);
    socket.on("conversation:update", ({ conversation }) => {
      setConversations((prev) => {
        const next = prev.map((item) =>
          item.id === conversation.id ? conversation : item
        );
        if (!next.find((item) => item.id === conversation.id)) {
          next.push(conversation);
        }
        return sortConversations(next);
      });
      setActiveConversation((prev) =>
        prev?.id === conversation.id ? conversation : prev
      );
    });
    socket.on("message:new", ({ conversation, message }) => {
      setConversations((prev) => {
        const next = prev.map((item) =>
          item.id === conversation.id ? conversation : item
        );
        if (!next.find((item) => item.id === conversation.id)) {
          next.push(conversation);
        }
        return sortConversations(next);
      });
      setActiveConversation((prev) =>
        prev?.id === conversation.id ? conversation : prev
      );
      setMessages((prev) => {
        if (!activeConversation || activeConversation.id !== conversation.id) {
          return prev;
        }
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
      setUser(result.user);
      setView("chats");
    } catch (error) {
      setLoginError("Credenciales invalidas");
    }
  }

  function handleLogout() {
    setTokenState("");
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
      const data = await apiGet("/api/admin/templates");
      setTemplates(data.templates || []);
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
      await apiPost("/api/admin/templates/sync", {});
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

  async function handleTemplateSubmit(event) {
    event.preventDefault();
    if (!templateForm.name.trim()) {
      setPageError("Completa el nombre");
      return;
    }
    const payload = {
      name: templateForm.name.trim(),
      language: templateForm.language.trim() || "es",
      category: templateForm.category.trim() || null,
      body_preview: templateForm.body_preview.trim(),
      is_active: templateForm.is_active,
    };
    try {
      if (templateForm.id) {
        await apiPatch(`/api/admin/templates/${templateForm.id}`, payload);
      } else {
        await apiPost("/api/admin/templates", payload);
      }
      setTemplateForm({
        id: "",
        name: "",
        language: "es",
        category: "",
        body_preview: "",
        is_active: true,
      });
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

  if (!token || !user) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="login-title">Podopie OS</div>
          <div className="login-subtitle">Acceso a bandeja multiusuario</div>
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
    open: "En linea",
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
        className={`message ${message.direction} ${
          message.type === "note" ? "note" : ""
        }`}
      >
        <div className="message-text">{message.text || `[${message.type}]`}</div>
        <div className="message-meta">{formatDate(message.created_at)}</div>
      </div>
    );
  });

  return (
    <div className={`app-shell ${view === "admin" ? "admin-shell" : ""}`}>
      <NavRail
        navItems={navItems}
        view={view}
        onSetView={setView}
        theme={theme}
        onToggleTheme={toggleTheme}
        user={user}
        isProfileOpen={isProfileOpen}
        onToggleProfile={() => setIsProfileOpen((prev) => !prev)}
        onLogout={handleLogout}
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
          currentRole={user.role}
          isAdmin={isAdmin}
          adminUsers={adminUsers}
          userForm={userForm}
          setUserForm={setUserForm}
          roleOptions={ROLE_OPTIONS}
          handleUserSubmit={handleUserSubmit}
          settings={settings}
          setSettings={setSettings}
          handleSaveSettings={handleSaveSettings}
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
          templates={templates}
          templateForm={templateForm}
          setTemplateForm={setTemplateForm}
          handleTemplateSubmit={handleTemplateSubmit}
          handleSyncTemplates={handleSyncTemplates}
          auditLogs={auditLogs}
          formatDate={formatDate}
          useShellLayout
          pageError={pageError}
        />
      ) : (
        <main
          className={`content ${view === "chats" ? "content-chats" : "content-page"}`}
        >
          {view === "chats" && (
            <ChatView
              activeConversation={activeConversation}
              conversations={conversations}
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

