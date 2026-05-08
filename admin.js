const sharedStore = window.CraneSharedState;
const adminCurrencyFormatter = new Intl.NumberFormat('en-UG', {
  style: 'currency',
  currency: 'UGX',
  maximumFractionDigits: 0
});

const adminUiState = {
  currentView: 'overview',
  selectedLoanId: null,
  loanFilter: 'all',
  borrowerSearch: '',
  adminNotificationsOpen: false
};

let adminWaveFrame = null;
let adminLiveSyncInterval = null;
const SITE_INTRO_DURATION_MS = 2100;
const INTRO_IDLE_TIME_MS = 10 * 60 * 1000; // 10 minutes
let lastActivityTime = Date.now();

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

function getAdminAuthState() {
  const token = localStorage.getItem('accessToken');
  const role = localStorage.getItem('userRole');
  const adminRole = localStorage.getItem('adminRole');

  return {
    token,
    role,
    adminRole,
    isAdmin: Boolean(token && role === 'admin' && adminRole === 'admin')
  };
}

function requireAdminLogin() {
  const auth = getAdminAuthState();

  if (auth.adminRole === 'master_admin') {
    window.location.href = 'admin-panel.html';
    return false;
  }

  if (!auth.isAdmin) {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('adminRole');
    window.location.href = 'admin-login.html';
    return false;
  }

  return true;
}

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAdminLogin()) {
    return;
  }

  initializeSiteIntro();
  initializeAdminConsole();
  setupIdleDetection();
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

function initializeAdminConsole() {
  setupAdminEventListeners();
  initializeAdminWave();
  refreshAdminConsole();
  sharedStore?.startAutoSync?.();
  sharedStore?.subscribe(() => {
    refreshAdminConsole();
  });
  window.addEventListener('storage', (event) => {
    if (event.key === sharedStore?.STORAGE_KEY) {
      sharedStore?.hydrate()
        .then(() => {
          refreshAdminConsole();
        })
        .catch((error) => {
          console.error('Failed to refresh admin shared state after storage event:', error);
        });
    }
  });
  sharedStore?.hydrate()
    .then(() => {
      refreshAdminConsole();
    })
    .catch((error) => {
      console.error('Failed to load admin shared state from the database:', error);
    });
}

function getSharedState() {
  return sharedStore.read();
}

function updateSharedState(updater) {
  sharedStore.update(updater)
    .then(() => {
      refreshAdminConsole();
    })
    .catch((error) => {
      console.error('Failed to persist admin shared state:', error);
      refreshAdminConsole();
    });
}

function refreshAdminConsole() {
  const state = getSharedState();
  renderOverview(state);
  renderApplications(state);
  renderBorrowers(state);
  renderLoans(state);
  renderCollections(state);
  renderReferrals(state);
  renderAudit(state);
  renderNotifications(state);
  ensureSelectedLoan(state);
}

function setupAdminEventListeners() {
  document.getElementById('admin-home-btn')?.addEventListener('click', () => switchAdminView('overview'));
  document.getElementById('admin-open-loans-btn')?.addEventListener('click', () => switchAdminView('loans'));
  document.getElementById('admin-view-borrowers-btn')?.addEventListener('click', () => switchAdminView('borrowers'));
  document.getElementById('admin-refresh-btn')?.addEventListener('click', handleAdminSync);
  document.getElementById('admin-sync-btn')?.addEventListener('click', handleAdminSync);
  document.getElementById('admin-back-app')?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  document.querySelectorAll('.nav-link[data-view]').forEach((link) => {
    link.addEventListener('click', handleAdminNavigation);
  });

  document.querySelectorAll('.menu-item[data-view]').forEach((link) => {
    link.addEventListener('click', handleAdminNavigation);
  });

  document.getElementById('admin-mobile-menu-toggle')?.addEventListener('click', toggleAdminSidebar);
  document.getElementById('admin-footer-menu')?.addEventListener('click', toggleAdminSidebar);
  document.getElementById('admin-sidebar-overlay')?.addEventListener('click', closeAdminSidebar);

  document.querySelectorAll('[data-footer-view]').forEach((button) => {
    button.addEventListener('click', () => switchAdminView(button.dataset.footerView));
  });

  document.querySelectorAll('[data-admin-box]').forEach((button) => {
    button.addEventListener('click', () => {
      const intent = button.dataset.adminBox;
      if (intent === 'review') {
        switchAdminView('overview');
        document.getElementById('admin-applications-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (intent === 'overdue') {
        adminUiState.loanFilter = 'overdue';
        switchAdminView('loans');
        refreshAdminConsole();
      }
      if (intent === 'repayments') {
        switchAdminView('collections');
      }
    });
  });

  document.getElementById('admin-loan-filter')?.addEventListener('change', (event) => {
    adminUiState.loanFilter = event.target.value;
    renderLoans(getSharedState());
  });

  document.getElementById('borrower-search')?.addEventListener('input', (event) => {
    adminUiState.borrowerSearch = event.target.value.trim().toLowerCase();
    renderBorrowers(getSharedState());
  });

  document.getElementById('admin-notification-btn')?.addEventListener('click', toggleAdminNotifications);
  document.getElementById('close-admin-notifications')?.addEventListener('click', toggleAdminNotifications);

  document.getElementById('close-loan-modal')?.addEventListener('click', closeLoanModal);
  document.getElementById('cancel-loan-action')?.addEventListener('click', closeLoanModal);
  document.getElementById('confirm-loan-action')?.addEventListener('click', confirmLoanAction);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAdminSidebar();
      closeLoanModal();
      if (adminUiState.adminNotificationsOpen) {
        toggleAdminNotifications();
      }
    }
  });

  // Admin logout
  document.getElementById('admin-logout-btn')?.addEventListener('click', handleAdminLogout);
}

function handleAdminLogout() {
  // Clear admin authentication
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('userRole');
  localStorage.removeItem('adminRole');
  localStorage.removeItem('adminUsername');

  // Redirect to admin login
  window.location.href = 'admin-login.html';
}

function handleAdminNavigation(event) {
  const view = event.currentTarget.dataset.view;
  if (!view) return;

  event.preventDefault();
  switchAdminView(view);
  closeAdminSidebar();
}

function switchAdminView(viewName) {
  adminUiState.currentView = viewName;

  document.querySelectorAll('.nav-link[data-view]').forEach((link) => {
    const isActive = link.dataset.view === viewName;
    link.classList.toggle('active', isActive);
    link.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  document.querySelectorAll('.menu-item[data-view]').forEach((link) => {
    const isActive = link.dataset.view === viewName;
    link.classList.toggle('active', isActive);
    link.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  document.querySelectorAll('.view-section').forEach((section) => {
    section.classList.toggle('active', section.id === `${viewName}-view`);
  });
}

function toggleAdminSidebar() {
  document.getElementById('admin-sidebar')?.classList.toggle('active');
  document.getElementById('admin-sidebar-overlay')?.classList.toggle('active');
  document.body.classList.toggle('mobile-menu-open');
}

function closeAdminSidebar() {
  document.getElementById('admin-sidebar')?.classList.remove('active');
  document.getElementById('admin-sidebar-overlay')?.classList.remove('active');
  document.body.classList.remove('mobile-menu-open');
}

function toggleAdminNotifications() {
  adminUiState.adminNotificationsOpen = !adminUiState.adminNotificationsOpen;
  document.getElementById('admin-notification-panel')?.classList.toggle('open', adminUiState.adminNotificationsOpen);
}

function renderOverview(state) {
  const activeLoans = state.loans.filter((loan) => loan.status === 'active');
  const overdueLoans = state.loans.filter((loan) => loan.status === 'overdue');
  const completedLoans = state.loans.filter((loan) => loan.status === 'completed');
  const unreadNotifications = state.notifications.filter((item) => item.unread);
  const inReview = state.admin.applications.filter((item) => item.status === 'review');

  setText('admin-outstanding-book', adminCurrencyFormatter.format(state.user.remainingBalance));
  setText('admin-focus-title', activeLoans.length ? `${activeLoans[0].borrowerName.split(' ')[0]} Portfolio` : 'Portfolio Review');
  setText('admin-focus-amount', adminCurrencyFormatter.format(state.user.remainingBalance));
  setText('admin-focus-active', String(activeLoans.length));
  setText('admin-focus-overdue', String(overdueLoans.length));
  setText('admin-focus-completed', String(completedLoans.length));
  setText('admin-focus-message', overdueLoans.length
    ? `${overdueLoans.length} overdue loan${overdueLoans.length > 1 ? 's are' : ' is'} synced back to the borrower dashboard.`
    : 'Shared borrower state is healthy and ready for the next release window.');
  setText('admin-stat-review', String(inReview.length));
  setText('admin-stat-risk', String(state.admin.riskAlerts.length));
  setText('admin-stat-alerts', String(unreadNotifications.length));
  setText('admin-alert-count', String(Math.max(1, unreadNotifications.length)));

  const tickerContent = document.getElementById('admin-ticker-content');
  if (tickerContent) {
    tickerContent.innerHTML = `
      <span class="ticker-item">Shared book: ${adminCurrencyFormatter.format(state.user.remainingBalance)} outstanding.</span>
      <span class="ticker-item">${overdueLoans.length} overdue loan${overdueLoans.length === 1 ? '' : 's'} currently need action.</span>
      <span class="ticker-item">${state.referrals.length} referral records are available in the ledger.</span>
    `;
  }

  if (adminLiveSyncInterval) {
    clearInterval(adminLiveSyncInterval);
  }

  adminLiveSyncInterval = window.setInterval(() => {
    const unread = getSharedState().notifications.filter((item) => item.unread).length;
    setText('admin-stat-alerts', String(unread));
  }, 15000);
}

function renderApplications(state) {
  const host = document.getElementById('admin-applications-list');
  if (!host) return;

  if (!state.admin.applications.length) {
    host.innerHTML = createEmptyState('No review items', 'New borrower and loan review requests will appear here.');
    return;
  }

  host.innerHTML = state.admin.applications.map((application) => `
    <div class="admin-row-card">
      <div class="admin-row-header">
        <div>
          <div class="admin-row-title">${application.user}</div>
          <div class="admin-row-subtitle">${application.id}</div>
        </div>
        <span class="admin-chip ${application.status}">${labelize(application.status)}</span>
      </div>
      <div class="admin-row-meta">
        <span>${adminCurrencyFormatter.format(application.amount)}</span>
        <span>Score ${application.score}</span>
        <span>${application.requestedAt}</span>
      </div>
      <div class="admin-row-actions">
        <button type="button" class="admin-action-btn" data-application-id="${application.id}" data-application-action="approve">Promote to active</button>
        <button type="button" class="admin-secondary-btn" data-application-id="${application.id}" data-application-action="review">Keep in review</button>
      </div>
    </div>
  `).join('');

  host.querySelectorAll('[data-application-action]').forEach((button) => {
    button.addEventListener('click', () => handleApplicationAction(button.dataset.applicationId, button.dataset.applicationAction));
  });
}

function renderBorrowers(state) {
  const host = document.getElementById('admin-borrowers-list');
  const snapshotHost = document.getElementById('admin-borrower-pulse');
  if (!host || !snapshotHost) return;

  const loans = state.loans;
  const borrowerMap = new Map();

  loans.forEach((loan) => {
    const existing = borrowerMap.get(loan.borrowerName) || {
      name: loan.borrowerName,
      count: 0,
      active: 0,
      overdue: 0,
      completed: 0,
      remaining: 0
    };

    existing.count += 1;
    existing.remaining += loan.remaining;
    existing[loan.status] += 1;
    borrowerMap.set(loan.borrowerName, existing);
  });

  let borrowers = Array.from(borrowerMap.values());

  if (adminUiState.borrowerSearch) {
    borrowers = borrowers.filter((borrower) =>
      borrower.name.toLowerCase().includes(adminUiState.borrowerSearch) ||
      state.loans.some((loan) => loan.borrowerName === borrower.name && loan.id.toLowerCase().includes(adminUiState.borrowerSearch))
    );
  }

  if (!borrowers.length) {
    host.innerHTML = createEmptyState('No matching borrowers', 'Try a different name or loan search.');
  } else {
    host.innerHTML = borrowers.map((borrower) => `
      <div class="admin-row-card">
        <div class="admin-row-header">
          <div>
            <div class="admin-row-title">${borrower.name}</div>
            <div class="admin-row-subtitle">${borrower.count} loan record${borrower.count === 1 ? '' : 's'}</div>
          </div>
          <span class="admin-chip ${borrower.overdue ? 'overdue' : 'active'}">${borrower.overdue ? 'Attention' : 'Healthy'}</span>
        </div>
        <div class="admin-row-meta">
          <span>${adminCurrencyFormatter.format(borrower.remaining)} outstanding</span>
          <span>${borrower.active} active</span>
          <span>${borrower.overdue} overdue</span>
          <span>${borrower.completed} completed</span>
        </div>
      </div>
    `).join('');
  }

  snapshotHost.innerHTML = borrowers.slice(0, 3).map((borrower) => `
    <div class="admin-row-card">
      <div class="admin-row-title">${borrower.name}</div>
      <div class="admin-row-meta">
        <span>${adminCurrencyFormatter.format(borrower.remaining)} outstanding</span>
        <span>${borrower.active} active</span>
        <span>${borrower.overdue} overdue</span>
      </div>
    </div>
  `).join('') || createEmptyState('No borrowers', 'Borrower health cards will appear here.');
}

function renderLoans(state) {
  const host = document.getElementById('admin-loans-list');
  if (!host) return;

  let loans = [...state.loans];
  if (adminUiState.loanFilter !== 'all') {
    loans = loans.filter((loan) => loan.status === adminUiState.loanFilter);
  }

  if (!loans.length) {
    host.innerHTML = createEmptyState('No loans in this view', 'Adjust the filter to see more book activity.');
    return;
  }

  host.innerHTML = loans.map((loan) => `
    <div class="admin-row-card ${loan.id === adminUiState.selectedLoanId ? 'selected' : ''}" data-loan-card="${loan.id}">
      <div class="admin-row-header">
        <div>
          <div class="admin-row-title">${loan.id}</div>
          <div class="admin-row-subtitle">${loan.borrowerName}</div>
        </div>
        <span class="admin-chip ${loan.status}">${labelize(loan.status)}</span>
      </div>
      <div class="admin-row-meta">
        <span>${adminCurrencyFormatter.format(loan.amount)} booked</span>
        <span>${adminCurrencyFormatter.format(loan.remaining)} remaining</span>
        <span>${loan.interest}% monthly</span>
        <span>${loan.term} month term</span>
      </div>
      <div class="admin-row-actions">
        <button type="button" class="admin-action-btn" data-loan-action-open="${loan.id}">Open action</button>
      </div>
    </div>
  `).join('');

  host.querySelectorAll('[data-loan-action-open]').forEach((button) => {
    button.addEventListener('click', () => openLoanModal(button.dataset.loanActionOpen));
  });
}

function renderCollections(state) {
  const summaryHost = document.getElementById('admin-collections-summary');
  const listHost = document.getElementById('admin-collections-list');
  if (!summaryHost || !listHost) return;

  const overdueLoans = state.loans.filter((loan) => loan.status === 'overdue');
  const activeLoans = state.loans.filter((loan) => loan.status === 'active');
  const completedLoans = state.loans.filter((loan) => loan.status === 'completed');

  summaryHost.innerHTML = `
    <div class="admin-summary-card">
      <span>Overdue Balance</span>
      <strong>${adminCurrencyFormatter.format(overdueLoans.reduce((sum, loan) => sum + loan.remaining, 0))}</strong>
    </div>
    <div class="admin-summary-card">
      <span>Active Collections</span>
      <strong>${activeLoans.length}</strong>
    </div>
    <div class="admin-summary-card">
      <span>Recovered / Completed</span>
      <strong>${completedLoans.length}</strong>
    </div>
  `;

  if (!overdueLoans.length) {
    listHost.innerHTML = createEmptyState('No overdue loans', 'Collections look clear right now.');
    return;
  }

  listHost.innerHTML = overdueLoans.map((loan) => `
    <div class="admin-row-card">
      <div class="admin-row-header">
        <div>
          <div class="admin-row-title">${loan.borrowerName}</div>
          <div class="admin-row-subtitle">${loan.id}</div>
        </div>
        <span class="admin-chip overdue">Overdue</span>
      </div>
      <div class="admin-row-meta">
        <span>${adminCurrencyFormatter.format(loan.remaining)} due</span>
        <span>${loan.dueDate ? formatDateRelative(loan.dueDate) : 'Due date unavailable'}</span>
      </div>
      <div class="admin-row-actions">
        <button type="button" class="admin-action-btn" data-collection-complete="${loan.id}">Mark repaid</button>
        <button type="button" class="admin-secondary-btn" data-collection-active="${loan.id}">Return to active</button>
      </div>
    </div>
  `).join('');

  listHost.querySelectorAll('[data-collection-complete]').forEach((button) => {
    button.addEventListener('click', () => applyLoanStatus(button.dataset.collectionComplete, 'completed', 'Collections marked the loan as repaid.'));
  });

  listHost.querySelectorAll('[data-collection-active]').forEach((button) => {
    button.addEventListener('click', () => applyLoanStatus(button.dataset.collectionActive, 'active', 'Collections returned the loan to active monitoring.'));
  });
}

function renderReferrals(state) {
  const host = document.getElementById('admin-referrals-list');
  if (!host) return;

  if (!state.referrals.length) {
    host.innerHTML = createEmptyState('No referrals', 'Shared referral activity will show up here.');
    return;
  }

  host.innerHTML = state.referrals.map((referral) => `
    <div class="admin-row-card">
      <div class="admin-row-header">
        <div>
          <div class="admin-row-title">${referral.name}</div>
          <div class="admin-row-subtitle">${referral.date}</div>
        </div>
        <span class="admin-chip ${referral.status === 'paid' ? 'active' : 'review'}">${labelize(referral.status)}</span>
      </div>
      <div class="admin-row-meta">
        <span>Level ${referral.level}</span>
        <span>${adminCurrencyFormatter.format(referral.earned)}</span>
      </div>
    </div>
  `).join('');
}

function renderAudit(state) {
  const host = document.getElementById('admin-audit-list');
  const riskHost = document.getElementById('admin-risk-alerts-list');
  if (!host || !riskHost) return;

  host.innerHTML = state.admin.auditLogs.map((log) => `
    <div class="admin-row-card">
      <div class="admin-row-header">
        <div>
          <div class="admin-row-title">${log.action}</div>
          <div class="admin-row-subtitle">${log.actor} · ${log.time}</div>
        </div>
      </div>
      <div class="admin-audit-detail">${log.details}</div>
    </div>
  `).join('');

  riskHost.innerHTML = state.admin.riskAlerts.map((alert) => `
    <div class="admin-row-card">
      <div class="admin-row-header">
        <div>
          <div class="admin-row-title">${alert.title}</div>
          <div class="admin-row-subtitle">${alert.time}</div>
        </div>
        <span class="admin-chip ${alert.severity}">${labelize(alert.severity)}</span>
      </div>
      <div class="admin-row-text">${alert.text}</div>
    </div>
  `).join('');
}

function renderNotifications(state) {
  const host = document.getElementById('admin-notifications-list');
  if (!host) return;

  host.innerHTML = state.notifications.map((notification) => `
    <div class="notification-item ${notification.unread ? 'unread' : ''}">
      <div class="notification-icon ${mapNotificationTone(notification.type)}">${notification.type === 'success' ? '+' : notification.type === 'warning' ? '!' : 'i'}</div>
      <div class="notification-content">
        <p class="notification-title">${notification.title}</p>
        <p class="notification-text">${notification.text}</p>
        <span class="notification-time">${notification.time}</span>
      </div>
    </div>
  `).join('');
}

function handleApplicationAction(applicationId, action) {
  updateSharedState((state) => {
    const application = state.admin.applications.find((item) => item.id === applicationId);
    if (!application) return state;

    application.status = action === 'approve' ? 'active' : 'review';

    if (action === 'approve') {
      state.notifications.unshift({
        id: Date.now(),
        type: 'success',
        title: 'Admin Review Complete',
        text: `${application.user}'s queued application was promoted to the active book.`,
        time: 'Just now',
        unread: true
      });

      state.admin.auditLogs.unshift({
        id: `AUD-${Date.now()}`,
        time: formatTimeStamp(),
        actor: 'Admin User',
        action: `Reviewed ${application.id}`,
        details: `Moved ${application.user} from review into the active book.`
      });
    }

    return state;
  });
}

function ensureSelectedLoan(state) {
  if (!state.loans.some((loan) => loan.id === adminUiState.selectedLoanId)) {
    adminUiState.selectedLoanId = state.loans[0]?.id || null;
  }
}

function openLoanModal(loanId) {
  const state = getSharedState();
  const loan = state.loans.find((item) => item.id === loanId);
  if (!loan) return;

  adminUiState.selectedLoanId = loanId;
  setText('action-loan-id', loan.id);
  setText('action-loan-borrower', loan.borrowerName);
  setText('action-loan-status', labelize(loan.status));
  document.getElementById('loan-action-select').value = loan.status;
  document.getElementById('loan-action-notes').value = '';
  document.getElementById('loan-action-modal')?.classList.add('open');
  renderLoans(state);
}

function closeLoanModal() {
  document.getElementById('loan-action-modal')?.classList.remove('open');
}

function confirmLoanAction() {
  const loanId = adminUiState.selectedLoanId;
  const nextStatus = document.getElementById('loan-action-select')?.value;
  const notes = document.getElementById('loan-action-notes')?.value.trim() || 'Admin updated the borrower record.';

  if (!loanId || !nextStatus) return;
  applyLoanStatus(loanId, nextStatus, notes);
  closeLoanModal();
}

function applyLoanStatus(loanId, nextStatus, notes) {
  updateSharedState((state) => {
    const loan = state.loans.find((item) => item.id === loanId);
    if (!loan) return state;

    loan.status = nextStatus;
    if (nextStatus === 'completed') {
      loan.remaining = 0;
      loan.paidInstallments = loan.term;
    }
    if (nextStatus === 'active' && loan.remaining === 0) {
      loan.remaining = Math.round(loan.amount * 0.15);
      loan.paidInstallments = Math.max(loan.term - 1, 1);
    }

    state.notifications.unshift({
      id: Date.now(),
      type: nextStatus === 'completed' ? 'success' : nextStatus === 'overdue' ? 'warning' : 'info',
      title: `Loan ${labelize(nextStatus)}`,
      text: `${loan.id} for ${loan.borrowerName} is now ${labelize(nextStatus).toLowerCase()}.`,
      time: 'Just now',
      unread: true
    });

    state.admin.auditLogs.unshift({
      id: `AUD-${Date.now()}`,
      time: formatTimeStamp(),
      actor: 'Admin User',
      action: `${loan.id} → ${labelize(nextStatus)}`,
      details: notes
    });

    return state;
  });
}

function handleAdminSync() {
  refreshAdminConsole();
  updateSharedState((state) => {
    state.admin.auditLogs.unshift({
      id: `AUD-${Date.now()}`,
      time: formatTimeStamp(),
      actor: 'Admin User',
      action: 'Manual sync',
      details: 'Admin console refreshed shared borrower and loan state.'
    });
    return state;
  });
}

function initializeAdminWave() {
  const canvas = document.getElementById('admin-wave-canvas');
  const container = canvas?.closest('.admin-balance-card');
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
  window.addEventListener('resize', resizeCanvas);

  const draw = (timestamp) => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const time = timestamp * 0.0011;
    const spacing = Math.max(12, Math.min(18, width / 22));
    const amplitudeX = Math.max(2.5, height * 0.018);
    const amplitudeY = Math.max(2, height * 0.014);

    context.clearRect(0, 0, width, height);
    context.lineWidth = 0.8;
    context.strokeStyle = 'rgba(255, 255, 255, 0.24)';

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

    context.strokeStyle = 'rgba(210, 242, 255, 0.16)';

    for (let x = -spacing; x <= width + spacing; x += spacing) {
      context.beginPath();
      for (let y = 0; y <= height; y += 6) {
        const waveX =
          x +
          Math.sin((y * 0.03) - (time * 1.35) + (x * 0.045)) * amplitudeX * 0.75 +
          Math.cos((y * 0.014) + (time * 0.95)) * amplitudeY;

        if (y === 0) {
          context.moveTo(waveX, y);
        } else {
          context.lineTo(waveX, y);
        }
      }
      context.stroke();
    }

    adminWaveFrame = requestAnimationFrame(draw);
  };

  if (adminWaveFrame) {
    cancelAnimationFrame(adminWaveFrame);
  }
  adminWaveFrame = requestAnimationFrame(draw);
}

function createEmptyState(title, message) {
  return `
    <div class="admin-empty-state">
      <h3>${title}</h3>
      <p>${message}</p>
    </div>
  `;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function labelize(value) {
  return String(value)
    .replace(/([A-Z])/g, ' $1')
    .replace(/[-_]/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function mapNotificationTone(type) {
  if (type === 'success') return 'info';
  if (type === 'warning') return 'warning';
  return 'danger';
}

function formatTimeStamp() {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDateRelative(isoString) {
  const time = new Date(isoString).getTime();
  if (Number.isNaN(time)) return 'Date unavailable';

  const diffDays = Math.ceil((time - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} late`;
  if (diffDays === 0) return 'Due today';
  return `Due in ${diffDays} day${diffDays === 1 ? '' : 's'}`;
}
