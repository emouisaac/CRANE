const { authenticate } = require("./authenticate");

function hasScope(user, scope) {
  return Array.isArray(user?.scope) && user.scope.includes(scope);
}

function authorize({ scope = null, role = null, error, code }) {
  return (req, res, next) => {
    authenticate(req, res, () => {
      if (scope && !hasScope(req.user, scope)) {
        return res.status(403).json({
          error,
          code,
        });
      }

      if (role && req.user?.role !== role) {
        return res.status(403).json({
          error,
          code,
        });
      }

      return next();
    });
  };
}

const requireAdmin = authorize({
  scope: "admin",
  error: "Admin access required",
  code: "ADMIN_ACCESS_REQUIRED",
});

const requireMasterAdmin = authorize({
  scope: "admin",
  role: "master_admin",
  error: "Master admin access required",
  code: "MASTER_ADMIN_ONLY",
});

const requireRegularAdmin = authorize({
  scope: "admin",
  role: "admin",
  error: "Regular admin access required",
  code: "REGULAR_ADMIN_ONLY",
});

module.exports = {
  authorize,
  requireAdmin,
  requireMasterAdmin,
  requireRegularAdmin,
};
