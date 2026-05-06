// Admin Authentication
const adminElements = {
  loginForm: document.getElementById('admin-login-form'),
  loginType: document.getElementById('admin-login-type'),
  usernameGroup: document.getElementById('admin-username-group'),
  username: document.getElementById('admin-username'),
  password: document.getElementById('admin-password'),
  passwordLabel: document.getElementById('admin-password-label'),
  subtitle: document.getElementById('admin-auth-subtitle'),
  submitBtn: document.getElementById('admin-login-submit-btn'),
  spinner: document.getElementById('admin-login-spinner'),
  passwordError: document.getElementById('admin-password-error'),
  backToApp: document.getElementById('back-to-app')
};

// Utility functions
function showError(element, message) {
  element.textContent = message;
  element.style.display = 'block';
}

function hideError(element) {
  element.textContent = '';
  element.style.display = 'none';
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

async function adminLogin({ loginType, username, password }) {
  return apiRequest('/admin/login', {
    body: JSON.stringify({
      loginType,
      username,
      password,
      deviceId: 'admin_device_' + Date.now()
    }),
  });
}

function updateLoginModeUI() {
  const loginType = adminElements.loginType.value;
  const isMasterAdmin = loginType === 'master_admin';

  adminElements.usernameGroup.style.display = isMasterAdmin ? 'none' : 'block';
  adminElements.username.required = !isMasterAdmin;
  adminElements.username.value = isMasterAdmin ? '' : adminElements.username.value;
  adminElements.passwordLabel.textContent = isMasterAdmin ? 'Master Password' : 'Admin Password';
  adminElements.password.placeholder = isMasterAdmin
    ? 'Enter master admin password'
    : 'Enter your admin password';
  adminElements.subtitle.textContent = isMasterAdmin
    ? 'Only the master admin should use the password stored in .env.'
    : 'Regular admins must sign in with the username and password created by the master admin.';
  hideError(adminElements.passwordError);
}

// Form handlers
async function handleAdminLogin(e) {
  e.preventDefault();

  const loginType = adminElements.loginType.value;
  const username = adminElements.username.value.trim();
  const password = adminElements.password.value.trim();

  if (!password) {
    showError(adminElements.passwordError, 'Please enter the password');
    return;
  }

  if (loginType === 'admin' && !username) {
    showError(adminElements.passwordError, 'Please enter the admin username');
    return;
  }

  hideError(adminElements.passwordError);
  setLoading(adminElements.submitBtn, adminElements.spinner, true);

  try {
    const result = await adminLogin({ loginType, username, password });

    // Store admin tokens and role
    localStorage.setItem('accessToken', result.accessToken);
    localStorage.setItem('refreshToken', result.refreshToken);
    localStorage.setItem('userRole', 'admin');
    localStorage.setItem('adminRole', result.role); // Store the specific admin role

    // Redirect to admin dashboard
    window.location.href = 'admin-panel.html';

  } catch (error) {
    showError(adminElements.passwordError, error.message);
  } finally {
    setLoading(adminElements.submitBtn, adminElements.spinner, false);
  }
}

function handleBackToApp() {
  window.location.href = 'index.html';
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  adminElements.loginForm.addEventListener('submit', handleAdminLogin);
  adminElements.backToApp.addEventListener('click', handleBackToApp);
  adminElements.loginType.addEventListener('change', updateLoginModeUI);
  updateLoginModeUI();

  // Check if already logged in as admin
  const token = localStorage.getItem('accessToken');
  const role = localStorage.getItem('userRole');

  if (token && role === 'admin') {
    // Already logged in as admin, redirect to admin dashboard
    window.location.href = 'admin-panel.html';
  }
});
