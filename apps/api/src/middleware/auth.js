const { verifyToken } = require("../lib/auth");
const prisma = require("../db");
const { resolveTenantContextById } = require("../tenancy/tenantResolver");
const { getRolePermissions, userHasPermission } = require("../services/rolePermissions");

function extractToken(req) {
  const header = req.headers.authorization || "";
  const parts = header.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
    return parts[1];
  }
  return null;
}

async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: "missing_token" });
    }
    const payload = verifyToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      tenant_id: payload.tenant_id || null,
      permissions: null,
    };
    if (req.user.role === "superadmin" && !req.user.tenant_id) {
      return next();
    }
    if (!req.user.tenant_id) {
      return res.status(401).json({ error: "missing_tenant" });
    }
    const context = await resolveTenantContextById(req.user.tenant_id);
    if (!context) {
      return res.status(403).json({ error: "tenant_not_ready" });
    }
    req.user.permissions = await getRolePermissions(context.prisma, req.user.role);
    return prisma.runWithPrisma(
      context.prisma,
      () => next(),
      { tenantId: context.tenantId, channel: context.channel }
    );
  } catch (error) {
    return res.status(401).json({ error: "invalid_token" });
  }
}

function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: "forbidden" });
    }
    return next();
  };
}

function matchesPermissionCheck(req, check) {
  if (typeof check === "function") {
    return Boolean(check(req));
  }
  return userHasPermission(
    req.user,
    check.group,
    check.key,
    check.action || "read"
  );
}

function requireAnyPermission(checks) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ error: "forbidden" });
    }
    if (req.user.role === "superadmin") {
      return next();
    }
    if (checks.some((check) => matchesPermissionCheck(req, check))) {
      return next();
    }
    return res.status(403).json({ error: "forbidden" });
  };
}

function requirePermission(group, key, action = "read") {
  return requireAnyPermission([{ group, key, action }]);
}

function requireModulePermission(key, action = "read") {
  return requirePermission("modules", key, action);
}

function requireSettingPermission(key, action = "read") {
  return requirePermission("settings", key, action);
}

module.exports = {
  requireAuth,
  requireRole,
  requirePermission,
  requireAnyPermission,
  requireModulePermission,
  requireSettingPermission,
};
