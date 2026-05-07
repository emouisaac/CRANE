// Admin Authentication
const adminElements = {
  loginForm: document.getElementById('admin-login-form'),
  username: document.getElementById('admin-username'),
  password: document.getElementById('admin-password'),
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

async function adminLogin({ username, password }) {
  return apiRequest('/admin/login', {
    body: JSON.stringify({
      username,
      password,
      deviceId: 'admin_device_' + Date.now()
    }),
  });
}

// Form handlers
async function handleAdminLogin(e) {
  e.preventDefault();

  const username = adminElements.username.value.trim();
  const password = adminElements.password.value.trim();

  if (!username) {
    showError(adminElements.passwordError, 'Please enter your username');
    return;
  }

  if (!password) {
    showError(adminElements.passwordError, 'Please enter the password');
    return;
  }

  hideError(adminElements.passwordError);
  setLoading(adminElements.submitBtn, adminElements.spinner, true);

  try {
    const result = await adminLogin({ username, password });

    // Store admin tokens and role
    localStorage.setItem('accessToken', result.accessToken);
    localStorage.setItem('refreshToken', result.refreshToken);
    localStorage.setItem('userRole', 'admin');
    localStorage.setItem('adminRole', result.role); // Store the specific admin role

    // Redirect to the appropriate admin panel based on role
    if (result.role === 'master_admin') {
      window.location.href = 'admin-panel.html';
    } else {
      window.location.href = 'admin.html';
    }

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

  // Check if already logged in as admin
  const token = localStorage.getItem('accessToken');
  const role = localStorage.getItem('userRole');

  if (token && role === 'admin') {
    if (adminRole === 'master_admin') {
      window.location.href = 'admin-panel.html';
    } else if (adminRole === 'admin') {
      window.location.href = 'admin.html';
    }
  }
});
