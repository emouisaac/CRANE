// SwiftLend Dashboard JavaScript

// Dashboard State
const dashboardState = {
  user: null, // Will be loaded from API
  loans: [],
  applications: [],
  notifications: [],
  chatMessages: [],
  referrals: [],
  scoring: null,
  paymentHistory: [],
  scoreHistory: [],
  marketing: {
    offers: [],
    tickerMessages: [],
    pulse: {}
  }
};


const dashboardSharedStore = window.CraneSharedState;

// Currency Formatter
const currencyFormatter = new Intl.NumberFormat('en-UG', {
  style: 'currency',
  currency: 'UGX',
  maximumFractionDigits: 0
});

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function formatCurrency(amount = 0) {
  const numeric = Number(amount);
  return currencyFormatter.format(Number.isFinite(numeric) ? numeric : 0);
}

function formatDisplayValue(value, fallback = 'Not available') {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim();
  return normalized ? normalized : fallback;
}

function formatStatusLabel(status, fallback = 'Unknown') {
  if (!status) return fallback;
  return String(status)
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDateLabel(value, fallback = 'Not available') {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString('en-UG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTimeLabel(value, fallback = 'Not available') {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString('en-UG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCountdownFromDate(value, fallback = 'Not scheduled') {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  const diff = date.getTime() - Date.now();
  if (diff <= 0) return 'Due now';

  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `${days}d ${hours}h`;

  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${minutes}m`;
}

function getOutstandingLoans() {
  return Array.isArray(dashboardState.loans)
    ? dashboardState.loans.filter((loan) => Number(loan?.remaining) > 0)
    : [];
}

function getSelectedOutstandingLoan() {
  const selectedId = document.getElementById('loan-select')?.value;
  const outstandingLoans = getOutstandingLoans();
  return outstandingLoans.find((loan) => loan.id === selectedId) || outstandingLoans[0] || null;
}

function calculateInstallmentDue(loan) {
  if (!loan) return 0;
  const term = Math.max(Number(loan.term) || 1, 1);
  const amount = Number(loan.amount) || 0;
  const remaining = Number(loan.remaining) || 0;
  return Math.min(remaining, Math.max(Math.round(amount / term), 0));
}

function getScoreGrade(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) return 'No score yet';
  if (numericScore >= 760) return 'Excellent standing';
  if (numericScore >= 680) return 'Strong standing';
  if (numericScore >= 610) return 'Building momentum';
  return 'Needs improvement';
}

function updateNotificationBadge() {
  const badge = document.querySelector('.notification-badge');
  if (!badge) return;

  const unreadCount = dashboardState.notifications.filter((notification) => notification.unread).length;
  badge.textContent = String(unreadCount);
  badge.style.display = unreadCount > 0 ? 'inline-flex' : 'none';
}

function clearAuthState() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('deviceId');
  isAuthenticated = false;
  dashboardState.user = null;
  dashboardState.loans = [];
  dashboardState.applications = [];
  dashboardState.notifications = [];
  dashboardState.chatMessages = [];
  dashboardState.referrals = [];
  dashboardState.scoring = null;
  dashboardState.paymentHistory = [];
  dashboardState.scoreHistory = [];
  updateAuthButton();
  startIdleTimeout(); // Start idle timeout for unauthenticated users
}

function startIdleTimeout() {
  // Clear any existing idle timeout
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }

  // Only start idle timeout for unauthenticated users
  if (!isAuthenticated) {
    idleCheckInterval = setInterval(checkIdleTimeout, 30000); // Check every 30 seconds
  }
}

function stopIdleTimeout() {
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }
}

function closeLoginModal() {
  const loginModal = document.getElementById('login-modal');
  if (loginModal) {
    loginModal.style.display = 'none';
  }
  setLoginRequiredMessage('');
}

function setLoginRequiredMessage(message = '') {
  const note = document.getElementById('login-required-note');
  if (!note) return;

  note.textContent = message;
  note.style.display = message ? 'block' : 'none';
}

function openLoginModal(message = '') {
  const loginModal = document.getElementById('login-modal');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  if (loginModal) {
    loginModal.style.display = 'flex';
  }
  if (loginForm) {
    loginForm.classList.add('active');
  }
  if (registerForm) {
    registerForm.classList.remove('active');
  }
  updateAuthHeader('login');
  setLoginRequiredMessage(message);
}

let marketingOfferIndex = 0;
let marketingTickerIndex = 0;
let marketingRefreshCountdown = 12;
let sectionWaveAnimationFrame = null;
let sectionWaveResizeHandlerAttached = false;
let mobileMenuIsOpen = false;
let liveStatsInterval = null;
const SITE_INTRO_DURATION_MS = 2100;
const INTRO_IDLE_TIME_MS = 10 * 60 * 1000; // 10 minutes
let lastActivityTime = Date.now();
let idleCheckInterval = null;
const UNAUTH_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes for unauthenticated users
let isAuthenticated = false;

// Load user profile from API
async function loadUserProfile() {
  try {
    const token = localStorage.getItem('accessToken');
    const deviceId = localStorage.getItem('deviceId');
    if (!token) {
      clearAuthState();
      return false;
    }

    const response = await fetch('/api/profile/dashboard', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-device-id': deviceId || '',
      },
    });

    if (response.ok) {
      const data = await response.json();
      dashboardState.user = {
        ...(data.user || {}),
        email: data.profile?.email || data.user?.email || null,
        initials: data.user?.initials || (data.user?.name ? data.user.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'U'),
        nextDueDate: data.user?.nextDueDate ? new Date(data.user.nextDueDate) : null,
      };
      dashboardState.loans = Array.isArray(data.loans)
        ? data.loans.map((loan) => ({
            ...loan,
            dueDate: loan.dueDate ? new Date(loan.dueDate) : null,
          }))
        : [];
      dashboardState.applications = Array.isArray(data.applications)
        ? data.applications.map((application) => ({ ...application }))
        : [];
      dashboardState.notifications = Array.isArray(data.notifications)
        ? data.notifications.map((notification) => ({ ...notification }))
        : [];
      dashboardState.referrals = Array.isArray(data.referrals)
        ? data.referrals.map((referral) => ({ ...referral }))
        : [];
      dashboardState.scoring = data.scoring && typeof data.scoring === 'object'
        ? { ...data.scoring }
        : null;
      dashboardState.chatMessages = Array.isArray(data.messages)
        ? data.messages.map((message) => ({ ...message }))
        : [];
      if (data.marketing) {
        dashboardState.marketing = {
          ...dashboardState.marketing,
          ...data.marketing,
          pulse: {
            ...dashboardState.marketing.pulse,
            ...(data.marketing.pulse || {}),
          },
        };
      }
      return true;
    }

    if (response.status === 401 || response.status === 403) {
      clearAuthState();
    }

    console.error('Failed to load user profile', response.status);
    return false;
  } catch (error) {
    console.error('Error loading user profile:', error);
    clearAuthState();
    return false;
  }
}

// Track user activity to detect idle
function setupIdleDetection() {
  const updateActivity = () => {
    lastActivityTime = Date.now();
    localStorage.setItem('lastActivityTime', lastActivityTime.toString());
  };

  document.addEventListener('click', updateActivity);
  document.addEventListener('keydown', updateActivity);
  document.addEventListener('mousemove', updateActivity);
  document.addEventListener('scroll', updateActivity);
  document.addEventListener('touchstart', updateActivity);
}

// Check for idle timeout and redirect to login if needed
function checkIdleTimeout() {
  if (isAuthenticated) {
    // Clear interval if user becomes authenticated
    stopIdleTimeout();
    return;
  }

  const currentTime = Date.now();
  const timeSinceLastActivity = currentTime - lastActivityTime;

  if (timeSinceLastActivity >= UNAUTH_IDLE_TIMEOUT_MS) {
    // Clear the interval to prevent multiple modals
    stopIdleTimeout();
    // Show login prompt
    showLoginPrompt();
  }
}

// Show login prompt modal
function showLoginPrompt() {
  const modal = document.getElementById('login-modal');
  if (modal) {
    openLoginModal('Please sign in first to continue with your Crane account.');
  } else {
    // Fallback: reopen the in-page login modal if the route is not available
    closeLoginModal();
    openLoginModal('Please sign in first to continue with your Crane account.');
  }
}

// Initialize login modal functionality
function initializeLoginModal() {
  closeLoginModal();
  const loginModal = document.getElementById('login-modal');
  const loginModalClose = document.getElementById('login-modal-close');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const switchToRegister = document.getElementById('switch-to-register');
  const switchToLogin = document.getElementById('switch-to-login');
  const forgotPinLink = document.getElementById('forgot-pin-link');

  // Mobile login button
  const mobileLoginBtn = document.getElementById('mobile-login-btn');
  if (mobileLoginBtn) {
    mobileLoginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (loginModal) {
        loginModal.style.display = 'flex';
        // Reset to login form
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
        updateAuthHeader('login');
      }
    });
  }

  // Desktop login button
  const desktopLoginBtn = document.getElementById('desktop-login-btn');
  if (desktopLoginBtn) {
    desktopLoginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (loginModal) {
        loginModal.style.display = 'flex';
        // Reset to login form
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
        updateAuthHeader('login');
      }
    });
  }

  if (loginModalClose) {
    loginModalClose.addEventListener('click', () => {
      if (loginModal) {
        loginModal.style.display = 'none';
      }
    });
  }

  // Close modal when clicking outside
  if (loginModal) {
    loginModal.addEventListener('click', (e) => {
      if (e.target === loginModal) {
        loginModal.style.display = 'none';
      }
    });
  }

  // Switch to register form
  if (switchToRegister) {
    switchToRegister.addEventListener('click', (e) => {
      e.preventDefault();
      loginForm.classList.remove('active');
      registerForm.classList.add('active');
      updateAuthHeader('register');
    });
  }

  // Switch to login form
  if (switchToLogin) {
    switchToLogin.addEventListener('click', (e) => {
      e.preventDefault();
      registerForm.classList.remove('active');
      loginForm.classList.add('active');
      updateAuthHeader('login');
    });
  }

  if (forgotPinLink) {
    forgotPinLink.addEventListener('click', (e) => {
      e.preventDefault();
      openContactOptions();
    });
  }

  // Login form submission
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const phoneNumber = document.getElementById('login-phone').value.replace(/\s+/g, '');
      const pin = document.getElementById('login-pin').value;
      
      // Clear previous errors
      clearFormErrors();
      
      // Basic validation
      if (!phoneNumber || phoneNumber.length < 9) {
        showFormError('login-phone-error', 'Please enter a valid phone number');
        return;
      }
      
      if (!pin || pin.length !== 6) {
        showFormError('login-pin-error', 'Please enter a valid 6-digit PIN');
        return;
      }
      
      // Show loading state
      setButtonLoading('login-submit-btn', true);
      
      try {
          const deviceId = localStorage.getItem('deviceId') || `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('deviceId', deviceId);

        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phone: phoneNumber, pin, deviceId }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
          localStorage.setItem('accessToken', data.token);
          if (data.refreshToken) {
            localStorage.setItem('refreshToken', data.refreshToken);
          }

          isAuthenticated = true;
          const loaded = await loadUserProfile();
          if (loaded) {
            updateAuthButton();
            closeLoginModal();
            initializeDashboard();
            stopIdleTimeout(); // Stop idle timeout for authenticated users
          } else {
            showFormError('login-pin-error', 'Unable to load profile. Please try again.');
          }
        } else {
          showFormError('login-pin-error', data.error || 'Login failed');
        }
      } catch (error) {
        console.error('Login error:', error);
        showFormError('login-pin-error', 'Login failed. Please try again.');
      } finally {
        setButtonLoading('login-submit-btn', false);
      }
    });
  }

  // Register form submission
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const phoneNumber = document.getElementById('register-phone').value.replace(/\s+/g, '');
      const email = document.getElementById('register-email').value;
      const pin = document.getElementById('register-pin').value;
      const confirmPin = document.getElementById('register-pin-confirm').value;
      
      // Clear previous errors
      clearFormErrors();
      
      // Validation
      if (!phoneNumber || phoneNumber.length < 9) {
        showFormError('register-phone-error', 'Please enter a valid phone number');
        return;
      }
      
      if (email && !isValidEmail(email)) {
        showFormError('register-email-error', 'Please enter a valid email address');
        return;
      }
      
      if (!pin || pin.length !== 6) {
        showFormError('register-pin-error', 'Please enter a valid 6-digit PIN');
        return;
      }
      
      if (pin !== confirmPin) {
        showFormError('register-pin-confirm-error', 'PINs do not match');
        return;
      }
      
      // Show loading state
      setButtonLoading('register-submit-btn', true);
      
      try {
        const deviceId = localStorage.getItem('deviceId') || `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('deviceId', deviceId);

        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phone: phoneNumber, email: email || undefined, pin, deviceId }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
          localStorage.setItem('accessToken', data.token);
          if (data.refreshToken) {
            localStorage.setItem('refreshToken', data.refreshToken);
          }

          isAuthenticated = true;
          const loaded = await loadUserProfile();
          if (loaded) {
            updateAuthButton();
            closeLoginModal();
            initializeDashboard();
            stopIdleTimeout(); // Stop idle timeout for authenticated users
          } else {
            showFormError('register-pin-confirm-error', 'Unable to complete registration. Please try again.');
          }
        } else {
          showFormError('register-pin-confirm-error', data.error || 'Registration failed');
        }
      } catch (error) {
        console.error('Registration error:', error);
        showFormError('register-pin-confirm-error', 'Registration failed. Please try again.');
      } finally {
        setButtonLoading('register-submit-btn', false);
      }
    });
  }
}

// Update auth header based on current form
function updateAuthHeader(mode) {
  const authTitle = document.querySelector('.auth-title');
  const authSubtitle = document.querySelector('.auth-subtitle');
  
  if (mode === 'register') {
    if (authTitle) authTitle.textContent = 'Create Account';
    if (authSubtitle) authSubtitle.textContent = 'Join Crane and access loan services';
  } else {
    if (authTitle) authTitle.textContent = 'Welcome Back';
    if (authSubtitle) authSubtitle.textContent = 'Sign in to access your loan dashboard';
  }
}

// Form validation helpers
function clearFormErrors() {
  document.querySelectorAll('.form-error').forEach(error => {
    error.textContent = '';
    error.style.display = 'none';
  });
}

function showFormError(errorId, message) {
  const errorElement = document.getElementById(errorId);
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
  }
}

function setButtonLoading(buttonId, loading) {
  const button = document.getElementById(buttonId);
  if (!button) return;
  
  const btnText = button.querySelector('.btn-text');
  const spinner = button.querySelector('.btn-spinner');
  
  if (loading) {
    button.disabled = true;
    if (btnText) btnText.style.opacity = '0';
    if (spinner) spinner.style.display = 'block';
  } else {
    button.disabled = false;
    if (btnText) btnText.style.opacity = '1';
    if (spinner) spinner.style.display = 'none';
  }
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Update login/logout button based on authentication state
function updateAuthButton() {
  const mobileLoginBtn = document.getElementById('mobile-login-btn');
  const desktopLoginBtn = document.getElementById('desktop-login-btn');
  const user = dashboardState.user;

  if (isAuthenticated && user && user.phone) {
    // Show logout button
    if (mobileLoginBtn) {
      mobileLoginBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <polyline points="16 17 21 12 16 7"></polyline>
          <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
        <span>Logout</span>
      `;
      mobileLoginBtn.id = 'mobile-logout-btn';
      mobileLoginBtn.removeEventListener('click', handleMobileLoginClick);
      mobileLoginBtn.addEventListener('click', handleLogout);
    }
    
    if (desktopLoginBtn) {
      desktopLoginBtn.textContent = 'Logout';
      desktopLoginBtn.id = 'desktop-logout-btn';
      desktopLoginBtn.removeEventListener('click', handleDesktopLoginClick);
      desktopLoginBtn.addEventListener('click', handleLogout);
    }
  } else {
    // Show login button
    if (mobileLoginBtn) {
      mobileLoginBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
          <path d="M10 17l5-5-5-5"></path>
          <path d="M15 12H3"></path>
        </svg>
        <span>Login</span>
      `;
      mobileLoginBtn.id = 'mobile-login-btn';
      mobileLoginBtn.addEventListener('click', handleMobileLoginClick);
    }
    
    if (desktopLoginBtn) {
      desktopLoginBtn.textContent = 'Login';
      desktopLoginBtn.id = 'desktop-login-btn';
      desktopLoginBtn.addEventListener('click', handleDesktopLoginClick);
    }
  }
}

function handleMobileLoginClick(e) {
  e.preventDefault();
  const loginModal = document.getElementById('login-modal');
  if (loginModal) {
    loginModal.style.display = 'flex';
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    if (loginForm) loginForm.classList.add('active');
    if (registerForm) registerForm.classList.remove('active');
    updateAuthHeader('login');
  }
}

function handleDesktopLoginClick(e) {
  e.preventDefault();
  const loginModal = document.getElementById('login-modal');
  if (loginModal) {
    loginModal.style.display = 'flex';
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    if (loginForm) loginForm.classList.add('active');
    if (registerForm) registerForm.classList.remove('active');
    updateAuthHeader('login');
  }
}

// Handle logout
function handleLogout(e) {
  if (e && e.preventDefault) {
    e.preventDefault();
  }

  clearAuthState();
  closeChatBox();
  openLoginModal();
  alert('You have been logged out');
}

function getAuthenticatedHeaders() {
  const token = localStorage.getItem('accessToken');
  const deviceId = localStorage.getItem('deviceId') || '';
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-device-id': deviceId,
  };
}

// Open chat box
function openChatBox() {
  const chatContainer = document.getElementById('chat-container');
  if (chatContainer) {
    chatContainer.style.display = 'flex';
  }
  if (isAuthenticated) {
    loadChatMessages();
  }
}

// Close chat box
function closeChatBox() {
  const chatContainer = document.getElementById('chat-container');
  if (chatContainer) {
    chatContainer.style.display = 'none';
  }
}

// Open profile panel
function openProfilePanel() {
  const profilePanel = document.getElementById('profile-panel');
  if (profilePanel) {
    populateProfilePanel();
    profilePanel.classList.add('open');
  }
}

// Close profile panel
function closeProfilePanel() {
  const profilePanel = document.getElementById('profile-panel');
  if (profilePanel) {
    profilePanel.classList.remove('open');
  }
}

// Populate profile panel with user data
function populateProfilePanel() {
  const user = dashboardState.user;
  if (!user) return;

  setText('profile-initials', formatDisplayValue(user.initials, 'M'));
  setText('profile-name', formatDisplayValue(user.name, 'Account holder'));
  setText('profile-status-badge', formatStatusLabel(user.status, 'Unknown'));
  setText('profile-phone', formatDisplayValue(user.phone, 'Phone not available'));
  setText('profile-last-login', user.lastLoginAt ? `Last login ${formatDateTimeLabel(user.lastLoginAt)}` : 'Last activity is not available yet.');
  setText('profile-customer-id', formatDisplayValue(user.id, '--'));
  setText('profile-member-since', formatDateLabel(user.registeredAt, '--'));
  setText('profile-credit-score', Number.isFinite(Number(user.creditScore)) ? String(user.creditScore) : 'N/A');
  setText('profile-phone-info', formatDisplayValue(user.phone));
  setText('profile-email', formatDisplayValue(user.email));
  setText('profile-account-status', formatStatusLabel(user.status, 'Unknown'));
  setText('profile-last-login-info', formatDateTimeLabel(user.lastLoginAt));
}

// Initialize chat functionality
function initializeChat() {
  const chatCloseBtn = document.getElementById('chat-close-btn');
  const chatSendBtn = document.getElementById('chat-send-btn');
  const chatInput = document.getElementById('chat-input');
  const chatFooterBtn = document.getElementById('footer-chat-btn');
  
  if (chatCloseBtn) {
    chatCloseBtn.addEventListener('click', closeChatBox);
  }
  
  if (chatSendBtn) {
    chatSendBtn.addEventListener('click', sendChatMessage);
  }
  
  if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendChatMessage();
      }
    });
  }
  
  if (chatFooterBtn) {
    chatFooterBtn.addEventListener('click', () => {
      if (isAuthenticated) {
        openChatBox();
      } else {
        openLoginModal('Please sign in first to access support chat.');
      }
    });
  }

  // Close chat box when clicking outside
  document.addEventListener('click', (e) => {
    const chatContainer = document.getElementById('chat-container');
    const footerChatBtn = document.getElementById('footer-chat-btn');
    
    if (chatContainer && chatContainer.style.display !== 'none') {
      if (!chatContainer.contains(e.target) && e.target !== footerChatBtn && !footerChatBtn.contains(e.target)) {
        closeChatBox();
      }
    }
  });
}

function renderChatMessages() {
  const chatMessages = document.getElementById('chat-messages');
  if (!chatMessages) return;

  const messages = Array.isArray(dashboardState.chatMessages) ? dashboardState.chatMessages : [];
  if (!messages.length) {
    chatMessages.innerHTML = `
      <div class="chat-message system">
        <p>Welcome to Crane Support! How can we help you today?</p>
      </div>
    `;
    return;
  }

  chatMessages.innerHTML = messages.map((message) => `
    <div class="chat-message ${message.is_from_admin ? 'admin' : 'user'}">
      <p>${escapeHtml(message.message_text || '')}</p>
    </div>
  `).join('');
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function loadChatMessages() {
  if (!isAuthenticated) return;

  try {
    const response = await fetch('/api/profile/messages', {
      headers: getAuthenticatedHeaders(),
    });

    if (!response.ok) {
      return;
    }

    const data = await response.json();
    dashboardState.chatMessages = Array.isArray(data.messages) ? data.messages : [];
    renderChatMessages();
  } catch (error) {
    console.error('Failed to load chat messages:', error);
  }
}

// Send chat message
async function sendChatMessage() {
  const chatInput = document.getElementById('chat-input');
  if (!chatInput) return;
  
  const message = chatInput.value.trim();
  if (!message) return;

  try {
    const response = await fetch('/api/profile/messages', {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
      body: JSON.stringify({
        messageText: message,
        messageType: 'text',
      }),
    });

    if (!response.ok) {
      throw new Error('Unable to send message');
    }

    chatInput.value = '';
    await loadChatMessages();
  } catch (error) {
    console.error('Failed to send chat message:', error);
    alert('We could not send your message right now. Please try again.');
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function prefillLoanRequestForm(offer = null) {
  const user = dashboardState.user;
  const formDefaults = {
    name: document.getElementById('applicant-name'),
    phone: document.getElementById('applicant-phone'),
    email: document.getElementById('applicant-email'),
    amount: document.getElementById('loan-amount'),
    term: document.getElementById('loan-term'),
  };

  if (user) {
    if (formDefaults.name && !formDefaults.name.value) formDefaults.name.value = user.name || '';
    if (formDefaults.phone && !formDefaults.phone.value) formDefaults.phone.value = user.phone || '';
    if (formDefaults.email && !formDefaults.email.value) formDefaults.email.value = user.email || '';
  }

  if (offer) {
    if (formDefaults.amount) formDefaults.amount.value = offer.amount || '';
    if (formDefaults.term) {
      const normalizedTerm = String(parseInt(offer.term, 10) || 6);
      if ([...formDefaults.term.options].some((option) => option.value === normalizedTerm)) {
        formDefaults.term.value = normalizedTerm;
      }
    }
  }
}

function collectDocumentNames() {
  const documentInputs = [
    { id: 'id-front', label: 'id_front' },
    { id: 'id-back', label: 'id_back' },
    { id: 'income-proof', label: 'income_proof' },
    { id: 'bank-statement', label: 'bank_statement' },
    { id: 'selfie-photo', label: 'selfie_photo' },
    { id: 'additional-documents', label: 'additional_documents' },
  ];

  return documentInputs.flatMap(({ id, label }) => {
    const input = document.getElementById(id);
    if (!input?.files?.length) return [];
    return Array.from(input.files).map((file, index) => `${label}:${index + 1}:${file.name}`);
  });
}

const districtSubcountyMap = {
  kampala: ['Central', 'Kawempe', 'Makindye', 'Nakawa', 'Rubaga'],
  wakiso: ['Nansana', 'Kira', 'Katabi', 'Makindye Ssabagabo', 'Kasangati'],
  mukono: ['Mukono Central', 'Goma', 'Ntenjeru', 'Nakisunga'],
  entebbe: ['Division A', 'Division B', 'Katabi'],
  masaka: ['Nyendo-Mukungwe', 'Kimaanya-Kabonera', 'Buwunga'],
  mbarara: ['Kakoba', 'Nyamitanga', 'Kamukuzi'],
  fort_portal: ['Central', 'South Division', 'East Division'],
  jinja: ['Northern Division', 'Southern Division', 'Walukuba-Masese'],
  soroti: ['Western Division', 'Northern Division', 'Eastern Division'],
  lira: ['Central', 'Adyel', 'Ojwina'],
  gulu: ['Pece-Laroo', 'Bardege-Layibi', 'Bardege'],
  arua: ['Central Division', 'River Oli', 'Ayivu'],
  other: ['Community Centre', 'Urban Division', 'Rural Subcounty'],
};

function populateSubcountyOptions(selectedDistrict = '', selectedSubcounty = '') {
  const subcountySelect = document.getElementById('applicant-subcounty');
  if (!subcountySelect) return;

  const options = districtSubcountyMap[selectedDistrict] || [];
  subcountySelect.innerHTML = '<option value="">Select subcounty</option>' + options
    .map((name) => `<option value="${name}">${name}</option>`)
    .join('');

  if (selectedSubcounty && options.includes(selectedSubcounty)) {
    subcountySelect.value = selectedSubcounty;
  }
}

function setupLoanRequestForm() {
  const form = document.getElementById('loan-request-form');
  const feedback = document.getElementById('loan-request-feedback');
  if (!form || !feedback) return;

  const districtSelect = document.getElementById('applicant-district');
  if (districtSelect) {
    populateSubcountyOptions(districtSelect.value, document.getElementById('applicant-subcounty')?.value || '');
    districtSelect.addEventListener('change', () => {
      populateSubcountyOptions(districtSelect.value);
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!isAuthenticated) {
      openLoginModal('Please sign in before submitting a loan request.');
      return;
    }

    const payload = {
      fullName: document.getElementById('applicant-name')?.value?.trim(),
      phone: document.getElementById('applicant-phone')?.value?.trim(),
      email: document.getElementById('applicant-email')?.value?.trim(),
      idNumber: document.getElementById('applicant-id-number')?.value?.trim(),
      dateOfBirth: document.getElementById('applicant-dob')?.value,
      district: document.getElementById('applicant-district')?.value,
      subcounty: document.getElementById('applicant-subcounty')?.value,
      village: document.getElementById('applicant-village')?.value?.trim(),
      category: document.getElementById('applicant-category')?.value,
      amount: Number(document.getElementById('loan-amount')?.value),
      termMonths: Number(document.getElementById('loan-term')?.value),
      purpose: document.getElementById('loan-purpose')?.value,
      employerName: document.getElementById('employer-name')?.value?.trim(),
      positionTitle: document.getElementById('position-title')?.value?.trim(),
      employmentTenure: document.getElementById('employment-tenure')?.value?.trim(),
      businessName: document.getElementById('business-name')?.value?.trim(),
      businessType: document.getElementById('business-type')?.value?.trim(),
      businessRegistration: document.getElementById('business-registration')?.value?.trim(),
      monthlyIncome: Number(document.getElementById('monthly-income')?.value || 0),
      otherIncome: Number(document.getElementById('other-income')?.value || 0),
      existingObligations: document.getElementById('existing-obligations')?.value?.trim(),
      documents: collectDocumentNames(),
    };

    feedback.textContent = 'Submitting your application...';
    feedback.className = 'submission-feedback is-active';

    try {
      const response = await fetch('/api/loans/applications', {
        method: 'POST',
        headers: getAuthenticatedHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to submit the application right now.');
      }

      feedback.textContent = `Application ${data.application.id} submitted successfully. It is now in the admin review queue.`;
      feedback.className = 'submission-feedback is-active success';
      await loadUserProfile();
      initializeDashboard();
      switchView('loans');
    } catch (error) {
      feedback.textContent = error.message;
      feedback.className = 'submission-feedback is-active error';
    }
  });
}

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', async () => {
  // Check authentication
  const token = localStorage.getItem('accessToken');
  if (token) {
    isAuthenticated = true;
    const valid = await loadUserProfile();
    if (!valid) {
      isAuthenticated = false;
    } else {
      closeLoginModal();
    }
  }

  if (!isAuthenticated) {
    // For unauthenticated users, start idle timeout check
    startIdleTimeout();
  }

  // Initialize last activity time
  const storedActivityTime = localStorage.getItem('lastActivityTime');
  if (storedActivityTime) {
    lastActivityTime = parseInt(storedActivityTime);
  } else {
    lastActivityTime = Date.now();
    localStorage.setItem('lastActivityTime', lastActivityTime.toString());
  }

  initializeSiteIntro();
  initializeDashboard();
  initializeSectionWaveNet();
  setupEventListeners();
  setupLoanRequestForm();
  setupContactModal();
  startRealTimeUpdates();
  setupIdleDetection();

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    stopIdleTimeout();
  });

  // Update auth button on load
  updateAuthButton();

  // Initialize login modal functionality
  initializeLoginModal();

  // Initialize chat functionality
  initializeChat();
  renderChatMessages();
});

function initializeSiteIntro() {
  const intro = document.getElementById('site-intro');
  if (!intro) {
    document.body.classList.remove('intro-loading');
    document.body.classList.add('intro-complete');
    return;
  }

  // Check if intro should be shown
  const lastIntroTime = localStorage.getItem('lastIntroTime');
  const currentTime = Date.now();
  const shouldShowIntro = !lastIntroTime || (currentTime - parseInt(lastIntroTime)) >= INTRO_IDLE_TIME_MS;

  if (!shouldShowIntro) {
    // Skip intro - remove immediately
    document.body.classList.remove('intro-loading');
    document.body.classList.add('intro-complete');
    intro.remove();
    return;
  }

  // Show intro and save the time
  localStorage.setItem('lastIntroTime', currentTime.toString());
  lastActivityTime = currentTime;
  localStorage.setItem('lastActivityTime', currentTime.toString());

  const finishIntro = () => {
    intro.classList.add('is-hidden');
    document.body.classList.remove('intro-loading', 'intro-playing');
    document.body.classList.add('intro-complete');

    window.setTimeout(() => {
      intro.remove();
    }, 600);
  };

  window.requestAnimationFrame(() => {
    document.body.classList.add('intro-playing');
  });

  window.setTimeout(finishIntro, SITE_INTRO_DURATION_MS);
}

// Initialize Dashboard
function initializeDashboard() {
  updateWelcomeHeader();
  updateLoanBalance();
  updateHeroStats();
  initializeMarketingDashboard();
  populateLoansList();
  populateNotifications();
  populateLoanDetails('all');
  populateRepaymentOptions();
  populateScoreDrivers();
  populateReferrals();
  initializeCharts();
  updateCountdown();
  updateNotificationBadge();
  renderChatMessages();
  prefillLoanRequestForm();
}

function hydrateDashboardFromSharedState() {
  return;
}

function syncDashboardToSharedState() {
  return;
}

function initializeSectionWaveNet() {
  const canvas = document.getElementById('section-wave-canvas');
  const container = canvas?.closest('.first-section-card');
  if (!canvas || !container) return;

  const context = canvas.getContext('2d');
  if (!context) return;

  const resizeCanvas = () => {
    const rect = container.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * pixelRatio));
    canvas.height = Math.max(1, Math.floor(rect.height * pixelRatio));
    canvas.style.width = `${Math.max(1, Math.floor(rect.width))}px`;
    canvas.style.height = `${Math.max(1, Math.floor(rect.height))}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  };

  resizeCanvas();

  if (!sectionWaveResizeHandlerAttached) {
    window.addEventListener('resize', resizeCanvas);
    sectionWaveResizeHandlerAttached = true;
  }

  if (sectionWaveAnimationFrame) {
    cancelAnimationFrame(sectionWaveAnimationFrame);
  }

  const drawWaveNet = (timestamp) => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const time = timestamp * 0.0011;

    context.clearRect(0, 0, width, height);

    const spacing = Math.max(12, Math.min(18, width / 22));
    const amplitudeX = Math.max(2.5, height * 0.018);
    const amplitudeY = Math.max(2, height * 0.014);
    const lineColor = 'rgba(255, 255, 255, 0.22)';

    context.lineWidth = 0.8;
    context.strokeStyle = lineColor;

    for (let y = -spacing; y <= height + spacing; y += spacing) {
      context.beginPath();
      for (let x = 0; x <= width; x += 6) {
        const waveY =
          y +
          Math.sin((x * 0.028) - (time * 1.8) + (y * 0.06)) * amplitudeX +
          Math.cos((x * 0.012) + (time * 1.1)) * amplitudeY;

        if (x === 0) {
          context.moveTo(x, waveY);
        } else {
          context.lineTo(x, waveY);
        }
      }
      context.stroke();
    }

    sectionWaveAnimationFrame = requestAnimationFrame(drawWaveNet);
  };

  sectionWaveAnimationFrame = requestAnimationFrame(drawWaveNet);
}

// Update Welcome Header
function updateWelcomeHeader() {
  const userNameElement = document.getElementById('user-name');
  if (!userNameElement) return;

  if (dashboardState.user?.name) {
    const lastName = dashboardState.user.name.split(' ').filter(Boolean).pop();
    userNameElement.textContent = lastName || 'Member';
    return;
  }

  userNameElement.textContent = 'Member';
}

// Update Loan Balance Display
function updateLoanBalance() {
  const balanceElement = document.getElementById('loan-balance-amount');
  if (!balanceElement) return;

  balanceElement.textContent = formatCurrency(dashboardState.user?.remainingBalance || 0);
}

// Update Hero Stats
function updateHeroStats() {
  const { user } = dashboardState;
  const creditScore = user?.creditScore;

  setText('total-borrowed', formatCurrency(user?.totalBorrowed || 0));
  setText('remaining-balance', formatCurrency(user?.remainingBalance || 0));
  setText('credit-score-display', Number.isFinite(Number(creditScore)) ? String(creditScore) : 'N/A');
  setText('credit-score-grade', getScoreGrade(creditScore));
}

// Initialize Marketing Dashboard
function initializeMarketingDashboard() {
  const activeLoans = dashboardState.loans.filter((loan) => loan.status === 'active');
  const unreadCount = dashboardState.notifications.filter((notification) => notification.unread).length;
  const remainingBalance = Number(dashboardState.user?.remainingBalance) || 0;
  const nextDueLabel = formatDateLabel(dashboardState.user?.nextDueDate, 'Not scheduled');

  setText('snapshot-active-loans', String(activeLoans.length));
  setText('snapshot-outstanding-balance', formatCurrency(remainingBalance));
  setText('snapshot-next-due', nextDueLabel);
  setText('snapshot-unread-alerts', String(unreadCount));

  if (!isAuthenticated || !dashboardState.user) {
    setText('snapshot-title', 'No live account activity yet');
    setText('snapshot-message', 'Sign in to view current balances, due dates, and real account alerts.');
    setText('snapshot-badge', 'Awaiting sign in');
    return;
  }

  if (!dashboardState.loans.length && !dashboardState.notifications.length) {
    setText('snapshot-title', 'Your account is ready');
    setText('snapshot-message', 'Once you borrow or receive a service update, your live dashboard activity will appear here.');
    setText('snapshot-badge', formatStatusLabel(dashboardState.user.status, 'Active profile'));
    return;
  }

  setText('snapshot-title', activeLoans.length ? 'Live account activity' : 'No active loans right now');
  setText(
    'snapshot-message',
    activeLoans.length
      ? 'This summary is calculated from your current loans, due dates, and notification activity.'
      : 'Your dashboard is showing live account records, but there are no active loans on this profile right now.'
  );
  setText('snapshot-badge', unreadCount > 0 ? `${unreadCount} unread alert${unreadCount === 1 ? '' : 's'}` : 'Live data only');
}

function populateRepaymentOptions() {
  const loanSelect = document.getElementById('loan-select');
  const earlyRepayButton = document.getElementById('early-repay-btn');
  if (!loanSelect) return;

  const outstandingLoans = getOutstandingLoans();
  const previousSelection = loanSelect.value;

  if (!outstandingLoans.length) {
    loanSelect.innerHTML = '<option value="">No outstanding loans</option>';
    loanSelect.disabled = true;
    if (earlyRepayButton) {
      earlyRepayButton.disabled = true;
    }
    updateRepaymentSummary();
    return;
  }

  loanSelect.innerHTML = outstandingLoans
    .map((loan) => `<option value="${loan.id}">${loan.id} • ${formatCurrency(loan.remaining)}</option>`)
    .join('');
  loanSelect.disabled = false;

  if (outstandingLoans.some((loan) => loan.id === previousSelection)) {
    loanSelect.value = previousSelection;
  } else {
    loanSelect.value = outstandingLoans[0].id;
  }

  if (earlyRepayButton) {
    earlyRepayButton.disabled = false;
  }

  updateRepaymentSummary();
}

function updateRepaymentSummary() {
  const selectedLoan = getSelectedOutstandingLoan();
  const partialAmountInput = document.getElementById('partial-amount');
  const paymentType = document.querySelector('input[name="payment-type"]:checked')?.value || 'full';
  const installmentDue = calculateInstallmentDue(selectedLoan);
  const partialAmount = Math.max(0, Number(partialAmountInput?.value) || 0);
  const remainingBalance = Number(selectedLoan?.remaining) || 0;
  const totalToday = paymentType === 'partial'
    ? Math.min(remainingBalance, partialAmount)
    : installmentDue;

  setText('payment-installment-due', formatCurrency(installmentDue));
  setText('payment-service-fee', formatCurrency(0));
  setText('payment-total-today', formatCurrency(totalToday));
  setText('early-outstanding-principal', formatCurrency(remainingBalance));
  setText('early-payoff-benefit', formatCurrency(0));
  setText('early-total-payoff', formatCurrency(remainingBalance));

  const confirmAmount = document.getElementById('confirm-amount');
  if (confirmAmount) {
    confirmAmount.textContent = formatCurrency(totalToday);
  }
}

function populateScoreDrivers() {
  const host = document.getElementById('score-drivers-list');
  if (!host) return;

  const drivers = Array.isArray(dashboardState.scoring?.drivers)
    ? dashboardState.scoring.drivers.filter(Boolean)
    : [];

  if (!drivers.length) {
    host.innerHTML = '<div class="panel-empty-state compact">Credit drivers will appear here once your live profile data is available.</div>';
    return;
  }

  host.innerHTML = drivers
    .map((driver) => `
      <div class="score-driver-item">
        <span class="score-driver-dot" aria-hidden="true"></span>
        <p>${driver}</p>
      </div>
    `)
    .join('');
}

function populateReferrals() {
  const codeElement = document.getElementById('referral-code');
  const linkElement = document.getElementById('referral-link');
  const copyButton = document.getElementById('copy-referral-code');
  const tableBody = document.getElementById('referrals-table-body');
  const referrals = Array.isArray(dashboardState.referrals) ? dashboardState.referrals : [];

  if (codeElement) {
    codeElement.textContent = 'Unavailable';
  }

  if (linkElement) {
    linkElement.value = '';
  }

  if (copyButton) {
    copyButton.disabled = true;
    copyButton.textContent = 'Copy';
  }

  if (!tableBody) return;

  if (!referrals.length) {
    tableBody.innerHTML = '<tr><td colspan="5" class="table-empty-state">No referral activity has been recorded for this account yet.</td></tr>';
    return;
  }

  tableBody.innerHTML = referrals
    .map((referral) => `
      <tr>
        <td>${formatDisplayValue(referral.name, 'Referral')}</td>
        <td>${formatDateLabel(referral.createdAt || referral.date)}</td>
        <td>${formatDisplayValue(referral.level, 'Level 1')}</td>
        <td>${formatCurrency(referral.earned || 0)}</td>
        <td><span class="status-badge ${String(referral.status || '').toLowerCase() === 'paid' ? 'paid' : 'pending'}">${formatStatusLabel(referral.status, 'Pending')}</span></td>
      </tr>
    `)
    .join('');
}

// Update Marketing Pulse (live stats)
function updateMarketingPulse() {
  const { pulse } = dashboardState.marketing;
  setText('stat-approved', pulse.approvedToday);
  setText('stat-approval', pulse.approvalRate);
  setText('stat-repeat', pulse.repeatBorrowers);
}

// Update Active Offer Display
function updateActiveOffer() {
  const offer = dashboardState.marketing.offers[marketingOfferIndex];
  if (!offer) return;

  document.getElementById('offer-title').textContent = offer.title;
  document.getElementById('offer-amount').textContent = currencyFormatter.format(offer.amount);
  document.getElementById('offer-rate').textContent = offer.rate;
  document.getElementById('offer-installment').textContent = currencyFormatter.format(offer.installment);
  document.getElementById('offer-payout').textContent = offer.payout + ' ⚡';
  document.getElementById('offer-message').textContent = offer.message;
}

function advanceMarketingOffer() {
  if (!Array.isArray(dashboardState.marketing.offers) || dashboardState.marketing.offers.length === 0) return;
  marketingOfferIndex = (marketingOfferIndex + 1) % dashboardState.marketing.offers.length;
  // Removed countdown reset since we don't have automatic refreshes
  updateActiveOffer();
  // Removed renderOfferCountdown call
  animateOfferChange();
}

function updateMarketingTicker() {
  if (!Array.isArray(dashboardState.marketing.tickerMessages) || dashboardState.marketing.tickerMessages.length === 0) return;
  const tickerContent = document.getElementById('ticker-content');
  const message = dashboardState.marketing.tickerMessages[marketingTickerIndex];
  if (!tickerContent || !message) return;

  tickerContent.innerHTML = `<span class="ticker-item">${message}</span>`;
  restartTickerAnimation(tickerContent);
}

function advanceMarketingTicker() {
  marketingTickerIndex = (marketingTickerIndex + 1) % dashboardState.marketing.tickerMessages.length;
  updateMarketingTicker();
}

function restartTickerAnimation(tickerContent) {
  tickerContent.style.animation = 'none';
  setTimeout(() => {
    tickerContent.style.animation = 'scroll-left 20s linear infinite';
  }, 10);
}

// Setup Marketing Rotation (removed automatic rotation)
function setupMarketingRotation() {
  // Removed automatic intervals - now only manual refresh
  // Keep initial animation of live stats
  animateLiveStats();
}

// Animate offer change
function animateOfferChange() {
  const offerCard = document.getElementById('active-offer');
  if (offerCard) {
    offerCard.style.animation = 'none';
    setTimeout(() => {
      offerCard.style.animation = 'float-up 0.6s ease-out';
    }, 10);
  }
}

// Animate live stats with counter effect
function animateLiveStats() {
  const { pulse } = dashboardState.marketing;
  
  // Parse stat values
  const approvedNum = parseInt(pulse.approvedToday);
  const approvalNum = parseInt(pulse.approvalRate);
  const repeatNum = parseInt(pulse.repeatBorrowers);

  // Animate approved stat
  animateCounter('stat-approved', 0, approvedNum, 1200);
  
  // Animate approval stat
  animateCounter('stat-approval', 0, approvalNum, 1200, '%');
  
  // Animate repeat stat
  animateCounter('stat-repeat', 0, repeatNum, 1200, '%');

  if (liveStatsInterval) {
    clearInterval(liveStatsInterval);
  }

  // Repeat animation every 15 seconds
  liveStatsInterval = setInterval(() => {
    animateCounter('stat-approved', 0, approvedNum, 1200);
    animateCounter('stat-approval', 0, approvalNum, 1200, '%');
    animateCounter('stat-repeat', 0, repeatNum, 1200, '%');
  }, 15000);
}

// Counter animation function
function animateCounter(elementId, start, end, duration, suffix = '') {
  const element = document.getElementById(elementId);
  if (!element) return;

  const range = end - start;
  const increment = range / (duration / 16);
  let current = start;

  const animate = () => {
    current += increment;
    if (current < end) {
      element.textContent = Math.floor(current) + suffix;
      requestAnimationFrame(animate);
    } else {
      element.textContent = end + suffix;
    }
  };

  animate();
}

function renderOfferCountdown() {
  setText('offer-footnote', `Offer refreshes in ${marketingRefreshCountdown}s`);
}

// Update Offer Countdown
function updateOfferCountdown() {
  marketingRefreshCountdown = marketingRefreshCountdown > 1 ? marketingRefreshCountdown - 1 : 1;
  renderOfferCountdown();
}

// Populate Loans List
function populateLoansList() {
  const loansList = document.getElementById('loans-list');
  if (!loansList) return;

  const activeLoans = dashboardState.loans.filter((loan) => loan.status === 'active');
  if (!activeLoans.length) {
    loansList.innerHTML = '<div class="panel-empty-state compact">No active loans are on this account right now.</div>';
    return;
  }

  loansList.innerHTML = activeLoans.map((loan) => `
    <div class="loan-item" data-loan-id="${loan.id}">
      <div class="loan-info">
        <span class="loan-id">${loan.id}</span>
        <span class="loan-amount">${formatCurrency(loan.amount)}</span>
      </div>
      <div class="loan-status">
        <span class="status-dot ${loan.status}"></span>
        <span class="status-text ${loan.status}">${formatStatusLabel(loan.status)}</span>
      </div>
    </div>
  `).join('');
}

// Populate Loan Details
function populateLoanDetails(status = 'all') {
  const detailList = document.getElementById('loans-detail-list');
  if (!detailList) return;

  const loans = Array.isArray(dashboardState.loans) ? dashboardState.loans : [];
  const activeLoans = loans.filter(loan => loan.status === 'active');
  const overdueLoans = loans.filter(loan => loan.status === 'overdue');
  const completedLoans = loans.filter(loan => loan.status === 'completed');
  const totalBorrowed = loans.reduce((sum, loan) => sum + (loan.amount || 0), 0);
  const remainingBalance = loans.reduce((sum, loan) => sum + (loan.remaining || 0), 0);
  const user = dashboardState.user || {};

  let content = '';

  if (status === 'all') {
    content += createLoanOverviewBanner(
      'Portfolio Overview',
      currencyFormatter.format(totalBorrowed),
      'See everything borrowed, what is still running, and what is already cleared.',
      [
        { label: 'Remaining balance', value: currencyFormatter.format(remainingBalance) },
        { label: 'Active loans', value: `${activeLoans.length}` },
        { label: 'Completed loans', value: `${completedLoans.length}` }
      ],
      'All loans'
    );
    content += loans.length
      ? loans.map(createLoanDetailItem).join('')
      : createLoanEmptyState('No loans available yet.', 'Borrow a new loan to see it appear here instantly.');
  }

  if (status === 'active') {
    content += activeLoans.length
      ? activeLoans.map(createLoanDetailItem).join('')
      : createLoanEmptyState('No active loans right now.', 'Take a new offer when you are ready and it will appear here instantly.');
  }

  if (status === 'overdue') {
    content += overdueLoans.length
      ? overdueLoans.map(createLoanDetailItem).join('')
      : createLoanOverviewBanner(
          'Total Borrowed Snapshot',
          currencyFormatter.format(user.totalBorrowed ?? totalBorrowed),
          'No overdue loan is on this profile right now, so this tab highlights your full borrowed position.',
          [
            { label: 'Remaining balance', value: currencyFormatter.format(user.remainingBalance ?? remainingBalance) },
            { label: 'Next due in', value: formatCountdownFromDate(user.nextDueDate, 'No due date scheduled') },
            { label: 'Credit score', value: user.creditScore ?? 'N/A' }
          ],
          'Healthy account'
        );
  }

  if (status === 'completed') {
    content += completedLoans.length
      ? completedLoans.map(createLoanDetailItem).join('')
      : createLoanEmptyState('No completed loans yet.', 'Finish one repayment cycle and your cleared loans will be listed here.');
  }

  detailList.innerHTML = content;
}

// Create Loan Overview Banner
function createLoanOverviewBanner(kicker, amount, note, stats, badgeText) {
  return `
    <div class="loan-detail-item loan-overview-banner">
      <div class="loan-overview-top">
        <div>
          <span class="loan-overview-kicker">${kicker}</span>
          <h3>${amount}</h3>
        </div>
        <span class="portfolio-badge">${badgeText}</span>
      </div>
      <p class="loan-overview-note">${note}</p>
      <div class="loan-overview-grid">
        ${stats.map(stat => `
          <div class="overview-stat-card">
            <span>${stat.label}</span>
            <strong>${stat.value}</strong>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Create Loan Detail Item
function createLoanDetailItem(loan) {
  const payoffProgress = Math.min(100, Math.round((loan.paidInstallments / loan.term) * 100));
  const dueCopy = loan.dueDate
    ? `${Math.max(0, Math.ceil((loan.dueDate - Date.now()) / (1000 * 60 * 60 * 24)))} days left`
    : 'Loan completed';

  return `
    <div class="loan-detail-item">
      <div class="loan-detail-header">
        <span class="loan-detail-id">Loan #${loan.id}</span>
        <span class="status-text ${loan.status}">${loan.status.charAt(0).toUpperCase() + loan.status.slice(1)}</span>
      </div>
      <div class="loan-detail-grid">
        <div class="loan-detail-field">
          <span class="loan-detail-label">Amount borrowed</span>
          <span class="loan-detail-value">${currencyFormatter.format(loan.amount)}</span>
        </div>
        <div class="loan-detail-field">
          <span class="loan-detail-label">Remaining balance</span>
          <span class="loan-detail-value">${currencyFormatter.format(loan.remaining)}</span>
        </div>
        <div class="loan-detail-field">
          <span class="loan-detail-label">Interest rate</span>
          <span class="loan-detail-value">${loan.interest}% monthly</span>
        </div>
        <div class="loan-detail-field">
          <span class="loan-detail-label">Repayment term</span>
          <span class="loan-detail-value">${loan.term} months</span>
        </div>
      </div>
      <div class="factor">
        <span class="factor-name">Repayment progress</span>
        <div class="factor-bar"><div class="factor-fill" style="width: ${payoffProgress}%"></div></div>
        <span class="factor-value">${payoffProgress}%</span>
      </div>
      <div class="loan-detail-actions">
        <span class="loan-detail-label">${dueCopy}</span>
        <button class="text-button">${loan.status === 'completed' ? 'Borrow Again' : 'Manage Loan'}</button>
      </div>
    </div>
  `;
}

// Create Loan Empty State
function createLoanEmptyState(title, message) {
  return `
    <div class="loan-detail-item empty-state">
      <h3>${title}</h3>
      <p>${message}</p>
    </div>
  `;
}

// Populate Notifications
function populateNotifications() {
  const notificationsList = document.getElementById('notifications-list');
  if (!notificationsList) return;

  if (!dashboardState.notifications.length) {
    notificationsList.innerHTML = '<div class="panel-empty-state">No notifications yet. New account alerts will appear here.</div>';
    updateNotificationBadge();
    return;
  }

  notificationsList.innerHTML = dashboardState.notifications.map(notification => `
    <div class="notification-item ${notification.unread ? 'unread' : ''}">
      <div class="notification-icon ${notification.type}">${getNotificationIcon(notification.type)}</div>
      <div class="notification-content">
        <p class="notification-title">${notification.title}</p>
        <p class="notification-text">${notification.text}</p>
        <span class="notification-time">${notification.time}</span>
      </div>
    </div>
  `).join('');
  updateNotificationBadge();
}

// Get Notification Icon
function getNotificationIcon(type) {
  const icons = {
    success: '+',
    warning: '!',
    info: 'i'
  };
  return icons[type] || 'i';
}

// Initialize Charts
function initializeCharts() {
  initializePaymentChart();
  initializeScoreHistoryChart();
  initializeSpendingChart();
  initializeEarningsChart();
}

// Payment Chart
function initializePaymentChart() {
  const canvas = document.getElementById('payment-chart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const data = dashboardState.paymentHistory;
  
  // Simple bar chart implementation
  const maxAmount = Math.max(...data.map(d => d.amount));
  const barWidth = 50;
  const gap = 30;
  const startX = 40;
  const chartHeight = 160;
  
  canvas.width = 320;
  canvas.height = 200;
  
  ctx.fillStyle = '#f8faf9';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw bars
  data.forEach((item, index) => {
    const barHeight = (item.amount / maxAmount) * chartHeight;
    const x = startX + index * (barWidth + gap);
    const y = 180 - barHeight;
    
    // Gradient fill
    const gradient = ctx.createLinearGradient(x, y, x, 180);
    gradient.addColorStop(0, '#0d8b63');
    gradient.addColorStop(1, '#18aa79');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barHeight, 8);
    ctx.fill();
    
    // Label
    ctx.fillStyle = '#5f7165';
    ctx.font = '12px Manrope';
    ctx.textAlign = 'center';
    ctx.fillText(item.date, x + barWidth / 2, 195);
  });
}

// Score History Chart
function initializeScoreHistoryChart() {
  const canvas = document.getElementById('score-history-chart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const data = dashboardState.scoreHistory;
  
  canvas.width = 600;
  canvas.height = 180;
  
  ctx.fillStyle = '#f8faf9';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  const padding = 50;
  const chartWidth = canvas.width - padding * 2;
  const chartHeight = 120;
  const startY = 30;
  
  // Draw line
  ctx.beginPath();
  ctx.strokeStyle = '#0d8b63';
  ctx.lineWidth = 3;
  
  data.forEach((item, index) => {
    const x = padding + (index / (data.length - 1)) * chartWidth;
    const y = startY + chartHeight - (item.score - 650) / 100 * chartHeight;
    
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  
  ctx.stroke();
  
  // Draw points
  data.forEach((item, index) => {
    const x = padding + (index / (data.length - 1)) * chartWidth;
    const y = startY + chartHeight - (item.score - 650) / 100 * chartHeight;
    
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#0d8b63';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  
  // Draw labels
  ctx.fillStyle = '#5f7165';
  ctx.font = '11px Manrope';
  ctx.textAlign = 'center';
  
  data.forEach((item, index) => {
    const x = padding + (index / (data.length - 1)) * chartWidth;
    ctx.fillText(item.month, x, 170);
  });
}

// Spending Chart
function initializeSpendingChart() {
  const canvas = document.getElementById('spending-chart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  canvas.width = 200;
  canvas.height = 200;
  
  const centerX = 100;
  const centerY = 100;
  const radius = 70;
  
  const data = [
    { value: 65, color: '#0d8b63' },
    { value: 25, color: '#e6b84e' },
    { value: 10, color: '#2a5968' }
  ];
  
  let startAngle = -Math.PI / 2;
  
  data.forEach(item => {
    const sliceAngle = (item.value / 100) * Math.PI * 2;
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = item.color;
    ctx.fill();
    
    startAngle += sliceAngle;
  });
  
  // Center hole
  ctx.beginPath();
  ctx.arc(centerX, centerY, 40, 0, Math.PI * 2);
  ctx.fillStyle = '#f8faf9';
  ctx.fill();
}

// Earnings Chart
function initializeEarningsChart() {
  const canvas = document.getElementById('earnings-chart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  canvas.width = 300;
  canvas.height = 180;
  
  ctx.fillStyle = '#f8faf9';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  const data = [
    { month: 'Jan', amount: 50000 },
    { month: 'Feb', amount: 75000 },
    { month: 'Mar', amount: 100000 },
    { month: 'Apr', amount: 150000 }
  ];
  
  const maxAmount = 200000;
  const barWidth = 50;
  const gap = 20;
  const startX = 30;
  const chartHeight = 130;
  
  data.forEach((item, index) => {
    const barHeight = (item.amount / maxAmount) * chartHeight;
    const x = startX + index * (barWidth + gap);
    const y = 150 - barHeight;
    
    const gradient = ctx.createLinearGradient(x, y, x, 150);
    gradient.addColorStop(0, '#e6b84e');
    gradient.addColorStop(1, '#d4a53e');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barHeight, 6);
    ctx.fill();
  });
}

// Update Countdown
function updateCountdown() {
  const user = dashboardState.user;
  if (!user || !user.nextDueDate) return;

  const nextDueDate = new Date(user.nextDueDate);
  if (Number.isNaN(nextDueDate.getTime())) return;

  const now = new Date();
  const diff = nextDueDate - now;
  const countdownElement = document.getElementById('next-due-countdown');
  if (!countdownElement) return;

  if (diff > 0) {
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    countdownElement.textContent = `${days}d ${hours}h`;
  }
}

async function handleChangePin() {
  if (!isAuthenticated) {
    openLoginModal('Please sign in first to update your PIN.');
    return;
  }

  const currentPin = window.prompt('Enter your current 6-digit PIN:');
  if (!currentPin) return;
  const newPin = window.prompt('Enter your new 6-digit PIN:');
  if (!newPin) return;

  try {
    const response = await fetch('/api/profile/change-pin', {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
      body: JSON.stringify({ currentPin, newPin }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Unable to change PIN.');
    }
    alert('Your PIN has been updated successfully.');
  } catch (error) {
    alert(error.message);
  }
}

function handleSecuritySettings() {
  if (!dashboardState.user?.security) {
    alert('Security settings are not available yet for this account.');
    return;
  }

  const security = dashboardState.user.security;
  alert(
    `Security settings\n\nDevice binding: ${security.deviceBindingEnabled ? 'Enabled' : 'Disabled'}\nBiometric sign-in: ${security.biometricEnabled ? 'Enabled' : 'Disabled'}\nAuto-debit: ${security.autoDebitEnabled ? 'Enabled' : 'Disabled'}`
  );
}

async function handleNotificationPreferences() {
  if (!isAuthenticated) {
    openLoginModal('Please sign in first to manage notification preferences.');
    return;
  }

  const marketingEnabled = window.confirm('Enable marketing and promotional notifications for this account?');
  try {
    const currentPrefs = dashboardState.user?.notificationPreferences || {};
    const response = await fetch('/api/profile', {
      method: 'PUT',
      headers: getAuthenticatedHeaders(),
      body: JSON.stringify({
        notificationPreferences: {
          ...currentPrefs,
          marketing: marketingEnabled,
        },
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Unable to update notification preferences.');
    }
    await loadUserProfile();
    initializeDashboard();
    alert(`Marketing notifications ${marketingEnabled ? 'enabled' : 'disabled'}.`);
  } catch (error) {
    alert(error.message);
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Logout button
  document.getElementById('logout-btn')?.addEventListener('click', handleLogout);

  // Home footer button
  document.getElementById('home-nav-btn')?.addEventListener('click', () => {
    switchView('overview');
  });

  // Footer money/loans button
  document.getElementById('footer-money-btn')?.addEventListener('click', () => {
    if (!requireAuthFeature('loans')) return;
    switchView('loans');
  });

  // Contact Us button
  document.getElementById('contact-us-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    openContactOptions();
  });

  document.getElementById('mobile-contact-us-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    closeMobileMenu();
    openContactOptions();
  });

  // Footer chat button
  document.getElementById('footer-chat-btn')?.addEventListener('click', () => {
    if (isAuthenticated) {
      openChatBox();
    } else {
      openLoginModal('Please sign in first to access support chat.');
    }
  });

  // Footer profile button
  document.getElementById('footer-profile-btn')?.addEventListener('click', () => {
    if (isAuthenticated) {
      openProfilePanel();
    } else {
      openLoginModal('Please sign in first to view your profile settings.');
    }
  });

  // Close profile button
  document.getElementById('close-profile')?.addEventListener('click', closeProfilePanel);

  // Close profile panel when clicking outside
  document.addEventListener('click', (e) => {
    const profilePanel = document.getElementById('profile-panel');
    const footerProfileBtn = document.getElementById('footer-profile-btn');
    
    if (profilePanel && profilePanel.classList.contains('open')) {
      if (!profilePanel.contains(e.target) && e.target !== footerProfileBtn && !footerProfileBtn.contains(e.target)) {
        closeProfilePanel();
      }
    }
  });

  // Profile menu items
  document.getElementById('change-pin-btn')?.addEventListener('click', handleChangePin);
  document.getElementById('security-settings-btn')?.addEventListener('click', handleSecuritySettings);
  document.getElementById('notification-prefs-btn')?.addEventListener('click', handleNotificationPreferences);
  document.getElementById('help-btn')?.addEventListener('click', () => {
    openChatBox();
  });
  
  document.getElementById('terms-btn')?.addEventListener('click', () => {
    window.location.href = 'terms.html';
  });
  
  document.getElementById('profile-logout-btn')?.addEventListener('click', handleLogout);

  // Header brand/logo button
  document.getElementById('header-brand-btn')?.addEventListener('click', () => {
    switchView('overview');
  });

  // Apply Now button
  document.getElementById('apply-offer-btn')?.addEventListener('click', () => {
    if (!isAuthenticated) {
      openLoginModal('Please login to continue your application.');
      return;
    }

    const offer = dashboardState.marketing.offers[marketingOfferIndex];
    if (!offer) return;
    prefillLoanRequestForm(offer);
    switchView('get-loan');
  });

  // Navigation
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', handleNavigation);
  });
  
  // Mobile menu toggle
  document.querySelectorAll('.menu-toggle, .mobile-menu-btn').forEach(btn => {
    btn.addEventListener('click', toggleMobileMenu);
  });
  document.getElementById('mobile-menu-toggle')?.addEventListener('click', toggleMobileMenu);

  // Sidebar overlay click to close
  document.getElementById('sidebar-overlay')?.addEventListener('click', closeMobileMenu);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mobileMenuIsOpen) {
      closeMobileMenu();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768 && mobileMenuIsOpen) {
      closeMobileMenu();
    }
  });

  // Mobile search toggle
  document.getElementById('mobile-search-toggle')?.addEventListener('click', toggleMobileSearch);

  // Sidebar menu items
  document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const view = item.dataset.view;
      if (!view) {
        closeMobileMenu();
        return;
      }

      e.preventDefault();
      if (requireAuthFeature(view)) {
        switchView(view);
      }
      closeMobileMenu();
    });
  });
  
  // Notification button
  document.getElementById('notification-btn')?.addEventListener('click', toggleNotificationPanel);
  document.getElementById('close-notifications')?.addEventListener('click', toggleNotificationPanel);
  
  // Mark all read
  document.getElementById('mark-all-read')?.addEventListener('click', markAllNotificationsRead);
  
  // Payment form
  document.querySelectorAll('input[name="payment-type"]').forEach(radio => {
    radio.addEventListener('change', handlePaymentTypeChange);
  });
  document.getElementById('loan-select')?.addEventListener('change', updateRepaymentSummary);
  document.getElementById('partial-amount')?.addEventListener('input', updateRepaymentSummary);
  
  // Payment methods
  document.querySelectorAll('.payment-method').forEach(method => {
    method.addEventListener('click', handlePaymentMethodSelect);
  });
  
  // Payment modal
  document.getElementById('close-payment-modal')?.addEventListener('click', closePaymentModal);
  document.getElementById('cancel-payment')?.addEventListener('click', closePaymentModal);
  document.getElementById('confirm-payment-btn')?.addEventListener('click', confirmPayment);
  
  // Referral code copy
  document.getElementById('copy-referral-code')?.addEventListener('click', copyReferralCode);
  
  // Refresh dashboard button
  document.getElementById('refresh-dashboard')?.addEventListener('click', handleRefreshDashboard);
  
  // View all loans
  document.getElementById('view-all-loans')?.addEventListener('click', () => switchToLoansView('all'));
  document.getElementById('view-loan-options')?.addEventListener('click', () => switchToLoansView('all'));
  document.getElementById('view-more-insights')?.addEventListener('click', () => switchView('insights'));
  
  // Loan status pills
  document.querySelectorAll('.status-pill').forEach(pill => {
    pill.addEventListener('click', handleStatusFilter);
  });
  
  // Chart period buttons
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', handlePeriodChange);
  });
  
  // Auto-debit setup
  document.getElementById('setup-autodebit')?.addEventListener('click', setupAutoDebit);
  
  // Early repayment
  document.getElementById('early-repay-btn')?.addEventListener('click', handleEarlyRepayment);
  
  // Quick actions
  document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', handleQuickAction);
  });

  // Overview quick boxes
  document.querySelectorAll('[data-quick-box]').forEach(box => {
    box.addEventListener('click', handleQuickBoxClick);
  });

  // Loan items click
  document.getElementById('loans-list')?.addEventListener('click', handleLoanItemClick);
}

function requireAuthFeature(viewName) {
  if (viewName === 'overview') {
    return true;
  }

  if (!isAuthenticated) {
    openLoginModal('Please sign in first to access this feature.');
    return false;
  }

  return true;
}

function openContactOptions() {
  const overlay = document.getElementById('contact-modal-overlay');
  if (overlay) {
    overlay.classList.add('active');
  }
}

function closeContactModal() {
  const overlay = document.getElementById('contact-modal-overlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

function setupContactModal() {
  const phone = '+256788408032';
  const phoneNoFormat = phone.replace(/\D/g, '');
  const email = 'support@craneloans.com';

  // Update phone numbers in modal
  const callNumberEl = document.getElementById('call-number');
  const whatsappNumberEl = document.getElementById('whatsapp-number');
  if (callNumberEl) callNumberEl.textContent = phone;
  if (whatsappNumberEl) whatsappNumberEl.textContent = phone;

  // Close button
  const closeBtn = document.getElementById('contact-modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeContactModal);
  }

  // Overlay click to close
  const overlay = document.getElementById('contact-modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeContactModal();
      }
    });
  }

  // Call Now button
  const callBtn = document.getElementById('call-now-btn');
  if (callBtn) {
    callBtn.addEventListener('click', () => {
      closeContactModal();
      window.location.href = `tel:${phone}`;
    });
  }

  // WhatsApp button
  const whatsappBtn = document.getElementById('whatsapp-btn');
  if (whatsappBtn) {
    whatsappBtn.addEventListener('click', () => {
      closeContactModal();
      const whatsappUrl = `https://wa.me/${phoneNoFormat}?text=Hi%20Crane%20Support,%20I%20need%20assistance`;
      window.open(whatsappUrl, '_blank');
    });
  }

  // Email button
  const emailBtn = document.getElementById('email-btn');
  if (emailBtn) {
    emailBtn.addEventListener('click', () => {
      closeContactModal();
      window.location.href = `mailto:${email}?subject=Crane%20Support%20Request`;
    });
  }
}

function handleNavigation(event) {
  event.preventDefault();
  const viewName = event.currentTarget?.dataset.view;
  if (!viewName) return;

  if (!requireAuthFeature(viewName)) return;
  switchView(viewName);
}

// Switch View
function switchView(viewName) {
  // Update nav links
  document.querySelectorAll('.nav-link').forEach(link => {
    const isActive = link.dataset.view === viewName;
    link.classList.toggle('active', isActive);
    link.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  // Update sidebar menu items
  document.querySelectorAll('.menu-item').forEach(item => {
    const isActive = item.dataset.view === viewName;
    item.classList.toggle('active', isActive);
    item.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
  
  // Update view sections
  document.querySelectorAll('.view-section').forEach(section => {
    section.classList.toggle('active', section.id === `${viewName}-view`);
  });

  if (window.innerWidth <= 768 && mobileMenuIsOpen) {
    closeMobileMenu();
  }
}

// Handle Refresh Dashboard
async function handleRefreshDashboard() {
  const refreshBtn = document.getElementById('refresh-dashboard');
  if (refreshBtn) {
    // Add spinning animation
    const svg = refreshBtn.querySelector('svg');
    if (svg) {
      svg.style.transition = 'transform 0.3s ease';
      svg.style.transform = 'rotate(360deg)';
      
      // Reset after animation
      setTimeout(() => {
        svg.style.transform = 'rotate(0deg)';
      }, 300);
    }
  }
  
  if (isAuthenticated) {
    await loadUserProfile();
  }

  initializeDashboard();
}

// Switch To Loans View
function switchToLoansView(status = 'all') {
  switchView('loans');
  document.querySelectorAll('.status-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.status === status);
  });
  populateLoanDetails(status);
}

// Toggle Notification Panel
function toggleNotificationPanel() {
  const panel = document.getElementById('notification-panel');
  panel?.classList.toggle('open');
}

// Toggle Mobile Menu
function toggleMobileMenu() {
  setMobileMenuOpen(!mobileMenuIsOpen);
}

// Close Mobile Menu
function closeMobileMenu() {
  setMobileMenuOpen(false);
}

function setMobileMenuOpen(isOpen) {
  const sidebar = document.querySelector('.dashboard-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const toggleButton = document.getElementById('mobile-menu-toggle');

  mobileMenuIsOpen = isOpen;

  sidebar?.classList.toggle('active', isOpen);
  overlay?.classList.toggle('active', isOpen);
  toggleButton?.classList.toggle('active', isOpen);
  toggleButton?.setAttribute('aria-expanded', String(isOpen));
  toggleButton?.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
  document.body.classList.toggle('mobile-menu-open', isOpen);
}

// Toggle Mobile Search
function toggleMobileSearch() {
  const searchTerm = prompt('Search loans, transactions, or insights:');
  if (searchTerm && searchTerm.trim()) {
    const query = searchTerm.trim().toLowerCase();
    if (query.includes('loan')) {
      switchView('loans');
    } else if (query.includes('repay') || query.includes('payment')) {
      switchView('repay');
    } else if (query.includes('score')) {
      switchView('score');
    } else if (query.includes('referral')) {
      switchView('referrals');
    } else {
      switchView('overview');
    }
  }
}

// Mark All Notifications Read
async function markAllNotificationsRead() {
  dashboardState.notifications.forEach(n => n.unread = false);
  populateNotifications();

  if (isAuthenticated) {
    try {
      await fetch('/api/profile/notifications/read-all', {
        method: 'POST',
        headers: getAuthenticatedHeaders(),
      });
    } catch (error) {
      console.error('Failed to sync notification state:', error);
    }
  }
  
  // Update badge
  updateNotificationBadge();
}

// Handle Payment Type Change
function handlePaymentTypeChange(e) {
  const partialGroup = document.getElementById('partial-amount-group');
  if (!partialGroup) return;

  if (e.target.value === 'partial') {
    partialGroup.style.display = 'flex';
  } else {
    partialGroup.style.display = 'none';
  }

  updateRepaymentSummary();
}

// Handle Payment Method Select
function handlePaymentMethodSelect(e) {
  const method = e.currentTarget;
  document.querySelectorAll('.payment-method').forEach(m => m.classList.remove('active'));
  method.classList.add('active');
  
  // Update confirmation
  const methodName = method.querySelector('span').textContent;
  document.getElementById('confirm-method').textContent = methodName;
}

// Close Payment Modal
function closePaymentModal() {
  const modal = document.getElementById('payment-modal');
  if (!modal) return;

  delete modal.dataset.paymentMode;
  modal.classList.remove('open');
}

// Confirm Payment
async function confirmPayment() {
  const btn = document.getElementById('confirm-payment-btn');
  if (!btn) return;

  const paymentModal = document.getElementById('payment-modal');
  const selectedLoan = getSelectedOutstandingLoan();
  if (!selectedLoan) {
    alert('There is no outstanding loan to repay right now.');
    return;
  }

  const paymentType = paymentModal?.dataset.paymentMode === 'early'
    ? 'early'
    : (document.querySelector('input[name="payment-type"]:checked')?.value || 'full');
  const partialAmount = Math.max(0, Number(document.getElementById('partial-amount')?.value) || 0);

  let paymentAmount = calculateInstallmentDue(selectedLoan);
  if (paymentType === 'partial') {
    paymentAmount = Math.min(Number(selectedLoan.remaining) || 0, partialAmount);
  }
  if (paymentType === 'early') {
    paymentAmount = Number(selectedLoan.remaining) || 0;
  }

  if (paymentAmount <= 0) {
    alert(paymentType === 'partial'
      ? 'Enter a partial payment amount greater than zero.'
      : 'There is no payable balance available for this loan.');
    return;
  }

  btn.textContent = 'Processing...';
  btn.disabled = true;

  try {
    const response = await fetch(`/api/loans/${selectedLoan.id}/payments`, {
      method: 'POST',
      headers: getAuthenticatedHeaders(),
      body: JSON.stringify({
        amount: paymentAmount,
        method: 'mobile_money',
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Payment failed.');
    }

    await loadUserProfile();
    initializeDashboard();
    closePaymentModal();
    alert(`Payment of ${currencyFormatter.format(paymentAmount)} recorded successfully.`);
  } catch (error) {
    alert(error.message);
  } finally {
    btn.textContent = 'Confirm Payment';
    btn.disabled = false;
  }
}

// Copy Referral Code
function copyReferralCode() {
  const code = document.getElementById('referral-code')?.textContent;
  const btn = document.getElementById('copy-referral-code');
  if (!code || !btn || btn.disabled || !navigator.clipboard) return;

  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.textContent = 'Copy';
    }, 2000);
  });
}

// Handle Status Filter
function handleStatusFilter(e) {
  const status = e.target.dataset.status;
  
  // Update active pill
  document.querySelectorAll('.status-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.status === status);
  });

  populateLoanDetails(status);
}

// Handle Period Change
function handlePeriodChange(e) {
  const period = e.target.dataset.period;
  
  // Update active button
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.period === period);
  });
  
  // Update chart (simulated)
  console.log('Updating chart for period:', period);
}

// Setup Auto-Debit
async function setupAutoDebit() {
  const agree = document.getElementById('autodebit-agree');
  if (!agree) return;

  if (!agree.checked) {
    alert('Please agree to automatic deductions first.');
    return;
  }

  try {
    const response = await fetch('/api/profile', {
      method: 'PUT',
      headers: getAuthenticatedHeaders(),
      body: JSON.stringify({
        security: {
          ...(dashboardState.user?.security || {}),
          autoDebitEnabled: true,
        },
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Unable to enable auto-debit.');
    }
    await loadUserProfile();
    initializeDashboard();
    alert('Auto-debit has been enabled for your account.');
  } catch (error) {
    alert(error.message);
  }
}

// Handle Early Repayment
function handleEarlyRepayment() {
  const confirmAmount = document.getElementById('confirm-amount');
  const paymentModal = document.getElementById('payment-modal');
  const selectedLoan = getSelectedOutstandingLoan();
  if (!confirmAmount || !paymentModal || !selectedLoan) return;

  confirmAmount.textContent = formatCurrency(selectedLoan.remaining || 0);
  paymentModal.dataset.paymentMode = 'early';
  paymentModal.classList.add('open');
}

// Handle Quick Action
function handleQuickAction(e) {
  const action = e.currentTarget.dataset.action;
  
  switch (action) {
    case 'apply':
      if (!requireAuthFeature('get-loan')) return;
      switchView('get-loan');
      break;
    case 'repay':
      if (!requireAuthFeature('repay')) return;
      switchView('repay');
      break;
    case 'topup':
      if (!requireAuthFeature('get-loan')) return;
      switchView('get-loan');
      break;
    case 'early':
      if (!requireAuthFeature('repay')) return;
      switchView('repay');
      break;
  }
}

function handleQuickBoxClick(e) {
  const quickBox = e.currentTarget.dataset.quickBox;

  switch (quickBox) {
    case 'active':
      if (!requireAuthFeature('loans')) return;
      switchToLoansView('active');
      break;
    case 'overdue':
      if (!requireAuthFeature('loans')) return;
      switchToLoansView('overdue');
      break;
    case 'repay':
      if (!requireAuthFeature('repay')) return;
      switchView('repay');
      break;
  }
}

// Handle Loan Item Click
function handleLoanItemClick(e) {
  if (!requireAuthFeature('loans')) return;

  const loanItem = e.target.closest('.loan-item');
  if (loanItem) {
    const loanId = loanItem.dataset.loanId;
    console.log('Viewing loan details:', loanId);
    switchToLoansView('active');
  }
}

// Add Notification
function addNotification(notification) {
  dashboardState.notifications.unshift({
    id: Date.now(),
    ...notification
  });
  populateNotifications();
  syncDashboardToSharedState();
}

// Real-time Updates (WebSocket Simulation)
function startRealTimeUpdates() {
  setInterval(() => {
    updateCountdown();
  }, 60000);

  // Removed offer countdown update since we don't have automatic refreshes

  console.log('Dashboard live updates enabled');
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { dashboardState, initializeDashboard };
}
