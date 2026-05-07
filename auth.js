// Authentication state management
const authState = {
  isAuthenticated: false,
  accessToken: null,
  refreshToken: null,
  user: null,
  deviceId: null
};

// DOM elements
const elements = {
  // Login form
  loginForm: document.getElementById('login-form'),
  loginPhone: document.getElementById('login-phone'),
  loginCountry: document.getElementById('login-country'),
  loginPin: document.getElementById('login-pin'),
  loginSubmitBtn: document.getElementById('login-submit-btn'),
  loginSpinner: document.getElementById('login-spinner'),
  loginPhoneError: document.getElementById('login-phone-error'),
  loginPinError: document.getElementById('login-pin-error'),

  // Registration form
  registerForm: document.getElementById('register-form'),
  registerPhone: document.getElementById('register-phone'),
  registerCountry: document.getElementById('register-country'),
  registerEmail: document.getElementById('register-email'),
  registerPin: document.getElementById('register-pin'),
  registerPinConfirm: document.getElementById('register-pin-confirm'),
  registerSubmitBtn: document.getElementById('register-submit-btn'),
  registerSpinner: document.getElementById('register-spinner'),
  registerPhoneError: document.getElementById('register-phone-error'),
  registerEmailError: document.getElementById('register-email-error'),
  registerPinError: document.getElementById('register-pin-error'),
  registerPinConfirmError: document.getElementById('register-pin-confirm-error'),

  // Navigation
  switchToRegister: document.getElementById('switch-to-register'),
  switchToLogin: document.getElementById('switch-to-login'),
  forgotPinLink: document.getElementById('forgot-pin-link'),

  // Success modal
  successModal: document.getElementById('success-modal'),
  continueToOnboarding: document.getElementById('continue-to-onboarding')
};

// Country configurations
const countryConfig = {
  UG: {
    dialCode: "+256",
    placeholder: "7XX XXX XXX",
    format: [3, 3, 3],
    validate: (digits) => /^7\d{8}$/.test(digits),
  },
  KE: {
    dialCode: "+254",
    placeholder: "7XX XXX XXX",
    format: [3, 3, 3],
    validate: (digits) => /^(1|7)\d{8}$/.test(digits),
  },
  TZ: {
    dialCode: "+255",
    placeholder: "6XX XXX XXX",
    format: [3, 3, 3],
    validate: (digits) => /^(6|7)\d{8}$/.test(digits),
  },
  NG: {
    dialCode: "+234",
    placeholder: "8XX XXX XXXX",
    format: [3, 3, 4],
    validate: (digits) => /^[7-9]\d{9}$/.test(digits),
  },
};

// Utility functions
function generateDeviceId() {
  return 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function formatPhoneNumber(input, country) {
  const config = countryConfig[country];
  if (!config) return input;

  const digits = input.replace(/\D/g, '');
  const format = config.format;

  let formatted = '';
  let digitIndex = 0;

  for (const segment of format) {
    if (digitIndex >= digits.length) break;
    if (formatted) formatted += ' ';
    formatted += digits.substr(digitIndex, segment);
    digitIndex += segment;
  }

  return formatted;
}

function validatePhoneNumber(phone, country) {
  const config = countryConfig[country];
  if (!config) return false;

  const digits = phone.replace(/\D/g, '');
  return config.validate(digits);
}

function validateEmail(email) {
  if (!email || email.trim() === '') return true; // Optional field
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

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

async function registerUser(phone, email, pin, deviceId) {
  return apiRequest('/register', {
    body: JSON.stringify({ phone, email, pin, deviceId }),
  });
}

async function login(phone, pin, deviceId) {
  return apiRequest('/login', {
    body: JSON.stringify({ phone, pin, deviceId }),
  });
}

// Form switching
function switchToRegistration() {
  elements.loginForm.classList.remove('active');
  elements.registerForm.classList.add('active');
  document.querySelector('.auth-title').textContent = 'Create Account';
  document.querySelector('.auth-subtitle').textContent = 'Join Crane and access flexible loans';
}

function switchToLogin() {
  elements.registerForm.classList.remove('active');
  elements.loginForm.classList.add('active');
  document.querySelector('.auth-title').textContent = 'Welcome Back';
  document.querySelector('.auth-subtitle').textContent = 'Sign in to access your loan dashboard';
}

// Event handlers
async function handleRegister(e) {
  e.preventDefault();

  const phone = elements.registerPhone.value.replace(/\s/g, '');
  const email = elements.registerEmail.value.trim();
  const pin = elements.registerPin.value;
  const pinConfirm = elements.registerPinConfirm.value;
  const country = elements.registerCountry.value;

  // Validate inputs
  if (!validatePhoneNumber(phone, country)) {
    showError(elements.registerPhoneError, 'Please enter a valid phone number');
    return;
  }

  if (!validateEmail(email)) {
    showError(elements.registerEmailError, 'Please enter a valid email address');
    return;
  }

  if (!pin || pin.length !== 6) {
    showError(elements.registerPinError, 'Please enter a 6-digit PIN');
    return;
  }

  if (pin !== pinConfirm) {
    showError(elements.registerPinConfirmError, 'PINs do not match');
    return;
  }

  hideError(elements.registerPhoneError);
  hideError(elements.registerEmailError);
  hideError(elements.registerPinError);
  hideError(elements.registerPinConfirmError);
  setLoading(elements.registerSubmitBtn, elements.registerSpinner, true);

  try {
    const deviceId = generateDeviceId();
    const result = await registerUser(phone, email, pin, deviceId);

    // Store tokens
    authState.accessToken = result.accessToken;
    authState.refreshToken = result.refreshToken;
    authState.isAuthenticated = true;

    // Store in localStorage
    localStorage.setItem('accessToken', result.accessToken);
    localStorage.setItem('refreshToken', result.refreshToken);
    localStorage.setItem('deviceId', deviceId);

    // Show success modal
    elements.successModal.style.display = 'flex';

  } catch (error) {
    showError(elements.registerPinError, error.message);
  } finally {
    setLoading(elements.registerSubmitBtn, elements.registerSpinner, false);
  }
}

async function handleLogin(e) {
  e.preventDefault();

  const phone = elements.loginPhone.value.replace(/\s/g, '');
  const pin = elements.loginPin.value;
  const country = elements.loginCountry.value;

  // Validate inputs
  if (!validatePhoneNumber(phone, country)) {
    showError(elements.loginPhoneError, 'Please enter a valid phone number');
    return;
  }

  if (!pin || pin.length !== 6) {
    showError(elements.loginPinError, 'Please enter your 6-digit PIN');
    return;
  }

  hideError(elements.loginPhoneError);
  hideError(elements.loginPinError);
  setLoading(elements.loginSubmitBtn, elements.loginSpinner, true);

  try {
    const deviceId = localStorage.getItem('deviceId') || generateDeviceId();
    const result = await login(phone, pin, deviceId);

    // Store tokens
    authState.accessToken = result.accessToken;
    authState.refreshToken = result.refreshToken;
    authState.isAuthenticated = true;

    // Store in localStorage
    localStorage.setItem('accessToken', result.accessToken);
    localStorage.setItem('refreshToken', result.refreshToken);
    localStorage.setItem('deviceId', deviceId);

    // Redirect to dashboard
    window.location.href = 'index.html';

  } catch (error) {
    showError(elements.loginPinError, error.message);
  } finally {
    setLoading(elements.loginSubmitBtn, elements.loginSpinner, false);
  }
}

// Phone input formatting
function handlePhoneInput(e, countrySelect, errorElement) {
  const country = countrySelect.value;
  const config = countryConfig[country];

  if (config) {
    e.target.placeholder = config.placeholder;
  }

  const formatted = formatPhoneNumber(e.target.value, country);
  e.target.value = formatted;

  // Clear error on input
  hideError(errorElement);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Check if already authenticated
  const token = localStorage.getItem('accessToken');
  if (token) {
    // Redirect to dashboard if already logged in
    window.location.href = 'index.html';
    return;
  }

  // Set up phone input formatting
  elements.loginPhone.addEventListener('input', (e) => handlePhoneInput(e, elements.loginCountry, elements.loginPhoneError));
  elements.registerPhone.addEventListener('input', (e) => handlePhoneInput(e, elements.registerCountry, elements.registerPhoneError));

  // PIN input validation
  elements.registerPin.addEventListener('input', () => {
    hideError(elements.registerPinError);
  });

  elements.registerPinConfirm.addEventListener('input', () => {
    hideError(elements.registerPinConfirmError);
  });

  // Country change handlers
  elements.loginCountry.addEventListener('change', () => {
    elements.loginPhone.value = '';
    elements.loginPhone.placeholder = countryConfig[elements.loginCountry.value].placeholder;
  });

  elements.registerCountry.addEventListener('change', () => {
    elements.registerPhone.value = '';
    elements.registerPhone.placeholder = countryConfig[elements.registerCountry.value].placeholder;
  });

  // Form switching
  elements.switchToRegister.addEventListener('click', switchToRegistration);
  elements.switchToLogin.addEventListener('click', switchToLogin);

  // Form submissions
  elements.registerForm.addEventListener('submit', handleRegister);
  elements.loginForm.addEventListener('submit', handleLogin);

  // Success modal
  elements.continueToOnboarding.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  elements.forgotPinLink.addEventListener('click', () => {
    window.location.href = 'tel:+256788408032';
  });
});
