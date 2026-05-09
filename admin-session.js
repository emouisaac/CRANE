(() => {
  const STORAGE_KEYS = {
    accessToken: 'accessToken',
    refreshToken: 'refreshToken',
    userRole: 'userRole',
    adminRole: 'adminRole',
    adminUsername: 'adminUsername',
  };

  const ROUTES = {
    admin: '/admin',
    adminLogin: '/admin-login',
    masterAdmin: '/master-admin',
    masterAdminLogin: '/master-admin-login',
  };

  function readSession() {
    const accessToken = localStorage.getItem(STORAGE_KEYS.accessToken);
    const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken);
    const userRole = localStorage.getItem(STORAGE_KEYS.userRole);
    const adminRole = localStorage.getItem(STORAGE_KEYS.adminRole);
    const adminUsername = localStorage.getItem(STORAGE_KEYS.adminUsername);
    const isAdminUser = Boolean(accessToken && userRole === 'admin');

    return {
      accessToken,
      refreshToken,
      userRole,
      adminRole,
      adminUsername,
      isAdmin: Boolean(isAdminUser && adminRole === 'admin'),
      isMasterAdmin: Boolean(isAdminUser && adminRole === 'master_admin'),
      isAnyAdmin: Boolean(isAdminUser && (adminRole === 'admin' || adminRole === 'master_admin')),
    };
  }

  function clearSession() {
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  }

  function storeSession({ accessToken, refreshToken, adminRole, username }) {
    localStorage.setItem(STORAGE_KEYS.accessToken, accessToken);
    localStorage.setItem(STORAGE_KEYS.refreshToken, refreshToken);
    localStorage.setItem(STORAGE_KEYS.userRole, 'admin');
    localStorage.setItem(STORAGE_KEYS.adminRole, adminRole);
    localStorage.setItem(STORAGE_KEYS.adminUsername, username);
  }

  function getPanelRoute(role) {
    return role === 'master_admin' ? ROUTES.masterAdmin : ROUTES.admin;
  }

  function getLoginRoute(role) {
    return role === 'master_admin' ? ROUTES.masterAdminLogin : ROUTES.adminLogin;
  }

  function redirectToPanel(role, method = 'href') {
    const route = getPanelRoute(role);
    if (method === 'replace') {
      window.location.replace(route);
      return;
    }
    window.location.href = route;
  }

  function redirectToLogin(role, method = 'href') {
    const route = getLoginRoute(role);
    if (method === 'replace') {
      window.location.replace(route);
      return;
    }
    window.location.href = route;
  }

  function redirectAuthenticatedUser(_targetRole, method = 'href') {
    const session = readSession();

    if (session.isMasterAdmin) {
      redirectToPanel('master_admin', method);
      return true;
    }

    if (session.isAdmin) {
      redirectToPanel('admin', method);
      return true;
    }

    return false;
  }

  function ensurePanelAccess(requiredRole, method = 'href') {
    const session = readSession();

    if (requiredRole === 'master_admin') {
      if (session.isMasterAdmin) {
        return true;
      }

      if (session.isAdmin) {
        redirectToPanel('admin', method);
        return false;
      }

      clearSession();
      redirectToLogin('master_admin', method);
      return false;
    }

    if (session.isAdmin) {
      return true;
    }

    if (session.isMasterAdmin) {
      redirectToPanel('master_admin', method);
      return false;
    }

    clearSession();
    redirectToLogin('admin', method);
    return false;
  }

  window.CraneAdminSession = {
    ROUTES,
    STORAGE_KEYS,
    readSession,
    clearSession,
    storeSession,
    getPanelRoute,
    getLoginRoute,
    redirectToPanel,
    redirectToLogin,
    redirectAuthenticatedUser,
    ensurePanelAccess,
  };
})();
