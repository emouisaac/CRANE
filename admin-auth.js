// Admin Authentication - Regular Admin Users

const adminElements = {
  loginForm: document.getElementById('admin-login-form'),
  loginUsername: document.getElementById('admin-username'),
  loginPassword: document.getElementById('admin-password'),
  loginSubmitBtn: document.getElementById('admin-login-submit-btn'),
  loginSpinner: document.getElementById('admin-login-spinner'),
  usernameError: document.getElementById('admin-username-error'),
  passwordError: document.getElementById('admin-password-error'),
  backToAppButtons: Array.from(document.querySelectorAll('.back-to-app')),
};

const adminSession = window.CraneAdminSession;

// Utility functions
function showError(element, message) {
  if (element) {
    element.textContent = message;
    element.style.display = 'block';
  }
}

function hideError(element) {
  if (element) {
    element.textContent = '';
    element.style.display = 'none';
  }
}

function setLoading(button, spinner, loading) {
  button.disabled = loading;
  spinner.style.display = loading ? 'block' : 'none';
  button.querySelector('.btn-text').style.opacity = loading ? '0' : '1';
}

// API functions
async function apiRequest(endpoint, options = {}) {
  const baseURL = window.location.origin;
  const url = `${baseURL}/api/auth${endpoint}`;

  const defaultOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const response = await fetch(url, { ...defaultOptions, ...options });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

async function adminUserLogin({ username, password }) {
  return apiRequest('/admin/login', {
    body: JSON.stringify({
      username,
      password,
      loginType: 'admin',
      deviceId: 'admin_device_' + Date.now(),
    }),
  });
}

// Form handlers
async function handleAdminUserLogin(e) {
  e.preventDefault();

  const username = adminElements.loginUsername.value.trim();
  const password = adminElements.loginPassword.value.trim();

  if (!username) {
    showError(adminElements.usernameError, 'Please enter your username');
    return;
  }

  if (!password) {
    showError(adminElements.passwordError, 'Please enter the password');
    return;
  }

  hideError(adminElements.usernameError);
  hideError(adminElements.passwordError);
  setLoading(adminElements.loginSubmitBtn, adminElements.loginSpinner, true);

  try {
    const result = await adminUserLogin({ username, password });

    if (result.role === 'master_admin') {
      showError(adminElements.passwordError, 'Master admin credentials must use the master admin login page.');
      return;
    }

    adminSession.storeSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      adminRole: 'admin',
      username,
    });

    adminSession.redirectToPanel('admin');
  } catch (error) {
    showError(adminElements.passwordError, error.message);
  } finally {
    setLoading(adminElements.loginSubmitBtn, adminElements.loginSpinner, false);
  }
}

function handleBackToApp() {
  window.location.href = '/';
}

// Event listeners
document.addEventListener('DOMContentLoaded', async () => {
  adminElements.loginForm.addEventListener('submit', handleAdminUserLogin);
  adminElements.backToAppButtons.forEach((button) => button.addEventListener('click', handleBackToApp));
  await adminSession.redirectAuthenticatedUser('admin');
});
