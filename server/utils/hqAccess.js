export const isHQRole = (role) => ['SuperAdmin', 'HQManager', 'HQStaff'].includes(role);
export const isScopedHQRole = (role) => ['HQManager', 'HQStaff'].includes(role);

export const HQ_PERMISSIONS = Object.freeze({
  SuperAdmin: ['hq:view', 'hq:approve', 'users:manage', 'system:manage'],
  HQManager: ['hq:view', 'hq:approve'],
  HQStaff: ['hq:view'],
});

export const hasHQPermission = (role, permission) =>
  HQ_PERMISSIONS[role]?.includes(permission) || false;

// New HQ roles have national oversight, but never inherit system administration.
export const canHQRequest = (role, method, path) => {
  if (!isScopedHQRole(role)) return true;
  if (/^\/(users|access-approvals|settings\/system|settings\/rollover|settings\/archive-summary)(\/|$)/i.test(path)) return false;
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;
  // Personal notification state remains editable for read-only users.
  if (method === 'PUT' && /^\/notifications\/(read-all|[^/]+\/read)$/.test(path)) return true;
  return hasHQPermission(role, 'hq:approve') && method === 'PUT' && (
    /^\/semester-reports\/[^/]+\/(hq-approve|reject)$/.test(path)
    || /^\/industry-partners\/[^/]+\/hq-(approve|reject)$/.test(path)
    || /^\/partner-change-requests\/[^/]+\/(approve|reject|return)$/.test(path)
  );
};

export const enforceHQAccess = (req, res, next) => {
  if (!canHQRequest(req.user?.role, req.method, req.path)) {
    return res.status(403).json({ message: 'This action is not available for your HQ role' });
  }
  next();
};
