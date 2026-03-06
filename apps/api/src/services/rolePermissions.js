const {
    hasPermission,
    normalizeRoleKey,
    normalizeRolePermissions,
} = require("../config/roles");

async function getRolePermissions(prismaClient, role) {
    const normalizedRole = normalizeRoleKey(role);
    if (!normalizedRole) {
        return normalizeRolePermissions(null, normalizedRole);
    }
    const entry = await prismaClient.rolePermission.findUnique({
        where: { role: normalizedRole },
    });
    return normalizeRolePermissions(entry?.permissions_json || null, normalizedRole);
}

function userHasPermission(user, group, key, action = "read") {
    if (!user) {
        return false;
    }
    if (user.role === "superadmin" && !user.tenant_id) {
        return true;
    }
    return hasPermission(user.permissions, group, key, action);
}

module.exports = {
    getRolePermissions,
    userHasPermission,
};
