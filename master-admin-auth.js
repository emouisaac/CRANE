const masterAdminElements = {
  loginForm: document.getElementById('master-admin-login-form'),
  username: document.getElementById('master-admin-username'),
  password: document.getElementById('master-admin-password'),
  submitBtn: document.getElementById('master-admin-login-submit-btn'),
  spinner: document.getElementById('master-admin-login-spinner'),
  usernameError: document.getElementById('master-admin-username-error'),
  passwordError: document.getElementById('master-admin-password-error'),
  backToAppButtons: Array.from(document.querySelectorAll('.back-to-app')),
};

const adminSession = window.CraneAdminSession;

function showError(element, message) {
  if (!element) return;
  element.textContent = message;
  element.style.display = 'block';
}

function hideError(element) {
  if (!element) return;
  element.textContent = '';
  element.style.display = 'none';
}

function setLoading(button, spinner, loading) {
  button.disabled = loading;
  spinner.style.display = loading ? 'block' : 'none';
  button.querySelector('.btn-text').style.opacity = loading ? '0' : '1';
}

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

async function loginMasterAdmin({ username, password }) {
  return apiRequest('/admin/login', {
    body: JSON.stringify({
      username,
      password,
      loginType: 'master_admin',
      deviceId: 'master_admin_device_' + Date.now(),
    }),
  });
}

async function handleMasterAdminLogin(event) {
  event.preventDefault();

  const username = masterAdminElements.username.value.trim();
  const password = masterAdminElements.password.value.trim();

  if (!username) {
    showError(masterAdminElements.usernameError, 'Please enter the master admin username');
    return;
  }

  if (!password) {
    showError(masterAdminElements.passwordError, 'Please enter the master admin password');
    return;
  }

  hideError(masterAdminElements.usernameError);
  hideError(masterAdminElements.passwordError);
  setLoading(masterAdminElements.submitBtn, masterAdminElements.spinner, true);

  try {
    const result = await loginMasterAdmin({ username, password });

    adminSession.storeSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      adminRole: 'master_admin',
      username,
    });

    adminSession.redirectToPanel('master_admin');
  } catch (error) {
    showError(masterAdminElements.passwordError, error.message);
  } finally {
    setLoading(masterAdminElements.submitBtn, masterAdminElements.spinner, false);
  }
}

function handleBackToApp() {
  window.location.href = '/';
}

document.addEventListener('DOMContentLoaded', () => {
  masterAdminElements.loginForm.addEventListener('submit', handleMasterAdminLogin);
  masterAdminElements.backToAppButtons.forEach((button) => button.addEventListener('click', handleBackToApp));
  adminSession.redirectAuthenticatedUser('master_admin');
});
