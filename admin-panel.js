// Admin Panel Master Control System
const sharedStore = window.CraneSharedState;

const adminPanelState = {
  currentView: 'dashboard',
  selectedLoanId: null,
  selectedAdminId: null,
  selectedRiskId: null,
  mobileNavOpen: false,
  filters: {
    loanStatus: 'all',
    riskSeverity: 'all',
    riskStatus: 'all'
  }
};
const SITE_INTRO_DURATION_MS = 2100;
const INTRO_IDLE_TIME_MS = 10 * 60 * 1000; // 10 minutes
let lastActivityTime = Date.now();

const currencyFormatter = new Intl.NumberFormat('en-UG', {
  style: 'currency',
  currency: 'UGX',
  maximumFractionDigits: 0
});

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

// Initialize Admin Panel
document.addEventListener('DOMContentLoaded', () => {
  // Check admin authentication first
  const token = localStorage.getItem('accessToken');
  const role = localStorage.getItem('userRole');

  if (!token || role !== 'admin') {
    // Redirect to admin login if not authenticated as admin
    window.location.href = 'admin-login.html';
    return;
  }

  initializeSiteIntro();
  initializeAdminPanel();
  setupAdminEventListeners();
  renderDashboard();
  sharedStore?.startAutoSync?.();
  sharedStore?.subscribe(() => {
    renderViewContent(adminPanelState.currentView);
    syncSettingsForm(sharedStore.read());
  });
  sharedStore?.hydrate()
    .then(() => {
      renderViewContent(adminPanelState.currentView);
      syncSettingsForm(sharedStore.read());
    })
    .catch((error) => {
      console.error('Failed to load admin panel state from the database:', error);
    });
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

function initializeAdminPanel() {
  setupNavigation();
  updateMetrics();
}

function persistSharedState(updater) {
  return sharedStore.update(updater).catch((error) => {
    console.error('Failed to persist admin panel state:', error);
    throw error;
  });
}

function setupNavigation() {
  document.querySelectorAll('.header-nav .nav-link[data-view]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = e.target.dataset.view;
      if (view === 'dashboard' || view === 'loans' || view === 'admins' || view === 'risks' || view === 'settings' || view === 'audit') {
        switchAdminView(view);
        setMobileNavOpen(false);
      }
    });
  });

  document.getElementById('admin-panel-home-btn')?.addEventListener('click', () => {
    switchAdminView('dashboard');
    setMobileNavOpen(false);
  });
  document.getElementById('admin-panel-menu-toggle')?.addEventListener('click', () => {
    setMobileNavOpen(!adminPanelState.mobileNavOpen);
  });
  document.getElementById('admin-panel-nav-overlay')?.addEventListener('click', () => {
    setMobileNavOpen(false);
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768 && adminPanelState.mobileNavOpen) {
      setMobileNavOpen(false);
    }
  });
}

function setMobileNavOpen(isOpen) {
  adminPanelState.mobileNavOpen = isOpen;
  document.querySelector('.header-nav')?.classList.toggle('active', isOpen);
  document.getElementById('admin-panel-nav-overlay')?.classList.toggle('active', isOpen);
  document.getElementById('admin-panel-menu-toggle')?.classList.toggle('active', isOpen);
  document.getElementById('admin-panel-menu-toggle')?.setAttribute('aria-expanded', String(isOpen));
  document.body.classList.toggle('mobile-menu-open', isOpen);
}

function switchAdminView(viewName) {
  adminPanelState.currentView = viewName;

  // Update nav links
  document.querySelectorAll('.header-nav .nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.view === viewName);
  });

  // Hide all views
  document.querySelectorAll('.admin-view').forEach(view => {
    view.classList.remove('active');
  });

  // Show selected view
  const viewElement = document.getElementById(`${viewName}-view`);
  if (viewElement) {
    viewElement.classList.add('active');
    renderViewContent(viewName);
  }
}

function renderViewContent(viewName) {
  const state = sharedStore.read();
  
  switch (viewName) {
    case 'dashboard':
      renderDashboard();
      break;
    case 'loans':
      renderLoansView(state);
      break;
    case 'admins':
      renderAdminsView(state);
      break;
    case 'risks':
      renderRisksView(state);
      break;
    case 'audit':
      renderAuditView(state);
      break;
  }
}

function renderDashboard() {
  const state = sharedStore.read();
  const admin = state.admin;

  // Update metrics
  const pendingCount = admin.loanApplications.filter(a => a.status === 'pending').length;
  const activeLoans = state.loans.filter(l => l.status === 'active').length;
  const riskCount = admin.riskAlerts.filter(r => r.status === 'open').length;

  document.getElementById('pending-count').textContent = pendingCount;
  document.getElementById('active-loans').textContent = activeLoans;
  document.getElementById('risk-count').textContent = riskCount;
  document.getElementById('admin-count').textContent = admin.adminUsers.length;
  document.getElementById('alert-count').textContent = riskCount;

  // Render recent activities
  const activitiesHtml = admin.auditLogs.slice(0, 5).map(log => `
    <div class="activity-item">
      <div class="activity-info">
        <div class="activity-title">${log.action}</div>
        <div class="activity-actor">by ${log.actor}</div>
        <div class="activity-time">${log.time} - ${log.details}</div>
      </div>
    </div>
  `).join('');
  
  document.getElementById('recent-activities').innerHTML = activitiesHtml;
}

function renderLoansView(state) {
  const admin = state.admin;
  let applications = admin.loanApplications;

  // Apply filters
  if (adminPanelState.filters.loanStatus !== 'all') {
    applications = applications.filter(app => app.status === adminPanelState.filters.loanStatus);
  }

  const tableHtml = `
    <table>
      <thead>
        <tr>
          <th>Application ID</th>
          <th>Borrower</th>
          <th>Amount</th>
          <th>Term</th>
          <th>Score</th>
          <th>Status</th>
          <th>Requested</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${applications.map(app => `
          <tr class="table-row-clickable" onclick="viewLoanDetails('${app.id}')">
            <td><strong>${app.id}</strong></td>
            <td>${app.borrower}</td>
            <td>${currencyFormatter.format(app.amount)}</td>
            <td>${app.term} months</td>
            <td><strong>${app.score}</strong></td>
            <td><span class="status-badge ${app.status}">${app.status}</span></td>
            <td>${app.requestedAt}</td>
            <td><button class="btn btn-primary" onclick="viewLoanDetails('${app.id}'); event.stopPropagation();">Review</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  document.getElementById('loans-table').innerHTML = tableHtml;

  // Setup filter listeners
  document.getElementById('loan-status-filter').addEventListener('change', (e) => {
    adminPanelState.filters.loanStatus = e.target.value;
    renderLoansView(state);
  });
}

function viewLoanDetails(loanId) {
  const state = sharedStore.read();
  const application = state.admin.loanApplications.find(app => app.id === loanId);

  if (!application) return;

  adminPanelState.selectedLoanId = loanId;

  const detailsHtml = `
    <div class="detail-group">
      <span class="detail-label">Application ID</span>
      <span class="detail-value">${application.id}</span>
    </div>
    <div class="detail-group">
      <span class="detail-label">Borrower Name</span>
      <span class="detail-value">${application.borrower}</span>
    </div>
    <div class="detail-group">
      <span class="detail-label">Phone Number</span>
      <span class="detail-value">${application.phone}</span>
    </div>
    <div class="detail-group">
      <span class="detail-label">Loan Amount</span>
      <span class="detail-value highlight">${currencyFormatter.format(application.amount)}</span>
    </div>
    <div class="detail-group">
      <span class="detail-label">Loan Term</span>
      <span class="detail-value">${application.term} months</span>
    </div>
    <div class="detail-group">
      <span class="detail-label">Loan Purpose</span>
      <span class="detail-value">${application.purpose}</span>
    </div>
    <div class="detail-group">
      <span class="detail-label">Credit Score</span>
      <span class="detail-value highlight">${application.score}</span>
    </div>
    <div class="detail-group">
      <span class="detail-label">Current Status</span>
      <span class="detail-value"><span class="status-badge ${application.status}">${application.status}</span></span>
    </div>
    <div class="detail-group" style="grid-column: 1 / -1;">
      <span class="detail-label">Documents Submitted</span>
      <div class="documents-list">
        ${application.documents.map(doc => `<div class="document-item verified">${doc.replace(/_/g, ' ')}</div>`).join('')}
      </div>
    </div>
    ${application.rejectReason ? `
      <div class="detail-group" style="grid-column: 1 / -1;">
        <span class="detail-label">Rejection Reason</span>
        <span class="detail-value" style="color: var(--danger);">${application.rejectReason}</span>
      </div>
    ` : ''}
  `;

  document.getElementById('loan-detail-content').innerHTML = detailsHtml;
  document.getElementById('loan-detail-card').style.display = 'block';

  // Setup action buttons
  document.getElementById('approve-loan-btn').onclick = () => approveLoan(loanId);
  document.getElementById('reject-loan-btn').onclick = () => rejectLoan(loanId);
  document.getElementById('request-more-docs-btn').onclick = () => requestMoreDocs(loanId);

  document.getElementById('close-loan-detail').onclick = () => {
    document.getElementById('loan-detail-card').style.display = 'none';
  };
}

function approveLoan(loanId) {
  persistSharedState(state => {
    const app = state.admin.loanApplications.find(a => a.id === loanId);
    if (app) {
      app.status = 'approved';
      state.admin.auditLogs.unshift({
        id: `AUD-${Date.now()}`,
        time: new Date().toLocaleTimeString(),
        actor: 'Admin User',
        action: `Approved loan application ${loanId}`,
        details: `Promoted borrower ${app.borrower} for UGX ${app.amount}`
      });
    }
    return state;
  });

  alert(`✓ Loan application ${loanId} has been approved!`);
  document.getElementById('loan-detail-card').style.display = 'none';
  renderLoansView(sharedStore.read());
}

function rejectLoan(loanId) {
  const reason = prompt('Enter rejection reason:');
  if (!reason) return;

  persistSharedState(state => {
    const app = state.admin.loanApplications.find(a => a.id === loanId);
    if (app) {
      app.status = 'rejected';
      app.rejectReason = reason;
      state.admin.auditLogs.unshift({
        id: `AUD-${Date.now()}`,
        time: new Date().toLocaleTimeString(),
        actor: 'Admin User',
        action: `Rejected loan application ${loanId}`,
        details: reason
      });
    }
    return state;
  });

  alert(`✓ Loan application ${loanId} has been rejected.`);
  document.getElementById('loan-detail-card').style.display = 'none';
  renderLoansView(sharedStore.read());
}

function requestMoreDocs(loanId) {
  alert('Request for additional documents sent to borrower.\nThey will receive a notification to upload more documents.');
}

function renderAdminsView(state) {
  const admin = state.admin;

  const tableHtml = `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Name</th>
          <th>Email</th>
          <th>Role</th>
          <th>Status</th>
          <th>Created</th>
          <th>Last Login</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${admin.adminUsers.map(user => `
          <tr class="table-row-clickable" onclick="editAdminUser('${user.id}')">
            <td><strong>${user.id}</strong></td>
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td>${user.role.replace(/_/g, ' ')}</td>
            <td><span class="status-badge ${user.status}">${user.status}</span></td>
            <td>${user.createdAt}</td>
            <td>${user.lastLogin}</td>
            <td><button class="btn btn-secondary" onclick="editAdminUser('${user.id}'); event.stopPropagation();">Edit</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  document.getElementById('admins-table').innerHTML = tableHtml;
}

function editAdminUser(adminId) {
  const state = sharedStore.read();
  const user = state.admin.adminUsers.find(u => u.id === adminId);

  if (!user) return;

  adminPanelState.selectedAdminId = adminId;

  document.getElementById('edit-admin-name').value = user.name;
  document.getElementById('edit-admin-email').value = user.email;
  document.getElementById('edit-admin-role').value = user.role;
  document.getElementById('edit-admin-status').value = user.status;

  document.getElementById('edit-admin-card').style.display = 'block';

  document.getElementById('close-edit-admin').onclick = () => {
    document.getElementById('edit-admin-card').style.display = 'none';
  };

  document.getElementById('edit-admin-form').onsubmit = (e) => {
    e.preventDefault();
    updateAdminUser();
  };

  document.getElementById('delete-admin-btn').onclick = () => {
    if (confirm(`Are you sure you want to delete ${user.name}?`)) {
      deleteAdminUser(adminId);
    }
  };
}

function updateAdminUser() {
  const adminId = adminPanelState.selectedAdminId;
  const newRole = document.getElementById('edit-admin-role').value;
  const newStatus = document.getElementById('edit-admin-status').value;

  persistSharedState(state => {
    const user = state.admin.adminUsers.find(u => u.id === adminId);
    if (user) {
      user.role = newRole;
      user.status = newStatus;
      state.admin.auditLogs.unshift({
        id: `AUD-${Date.now()}`,
        time: new Date().toLocaleTimeString(),
        actor: 'Admin User',
        action: `Updated admin user ${adminId}`,
        details: `Role: ${newRole}, Status: ${newStatus}`
      });
    }
    return state;
  });

  alert('Admin user updated successfully!');
  document.getElementById('edit-admin-card').style.display = 'none';
  renderAdminsView(sharedStore.read());
}

function deleteAdminUser(adminId) {
  persistSharedState(state => {
    const index = state.admin.adminUsers.findIndex(u => u.id === adminId);
    if (index !== -1) {
      const deletedUser = state.admin.adminUsers[index];
      state.admin.adminUsers.splice(index, 1);
      state.admin.auditLogs.unshift({
        id: `AUD-${Date.now()}`,
        time: new Date().toLocaleTimeString(),
        actor: 'Admin User',
        action: `Deleted admin user ${adminId}`,
        details: `Removed ${deletedUser.name} (${deletedUser.email})`
      });
    }
    return state;
  });

  alert('Admin user deleted successfully!');
  document.getElementById('edit-admin-card').style.display = 'none';
  renderAdminsView(sharedStore.read());
}

function renderRisksView(state) {
  const admin = state.admin;
  let risks = admin.riskAlerts;

  // Apply filters
  if (adminPanelState.filters.riskSeverity !== 'all') {
    risks = risks.filter(r => r.severity === adminPanelState.filters.riskSeverity);
  }
  if (adminPanelState.filters.riskStatus !== 'all') {
    risks = risks.filter(r => r.status === adminPanelState.filters.riskStatus);
  }

  const tableHtml = `
    <table>
      <thead>
        <tr>
          <th>Risk ID</th>
          <th>Severity</th>
          <th>Title</th>
          <th>Description</th>
          <th>Status</th>
          <th>Time</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${risks.map(risk => `
          <tr class="table-row-clickable" onclick="viewRiskDetails('${risk.id}')">
            <td><strong>${risk.id}</strong></td>
            <td><span class="severity-${risk.severity}">${risk.severity.toUpperCase()}</span></td>
            <td>${risk.title}</td>
            <td>${risk.text}</td>
            <td><span class="status-badge ${risk.status}">${risk.status}</span></td>
            <td>${risk.time}</td>
            <td><button class="btn btn-secondary" onclick="viewRiskDetails('${risk.id}'); event.stopPropagation();">Review</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  document.getElementById('risks-table').innerHTML = tableHtml;

  document.getElementById('risk-severity-filter').addEventListener('change', (e) => {
    adminPanelState.filters.riskSeverity = e.target.value;
    renderRisksView(state);
  });

  document.getElementById('risk-status-filter').addEventListener('change', (e) => {
    adminPanelState.filters.riskStatus = e.target.value;
    renderRisksView(state);
  });
}

function viewRiskDetails(riskId) {
  const state = sharedStore.read();
  const risk = state.admin.riskAlerts.find(r => r.id === riskId);

  if (!risk) return;

  adminPanelState.selectedRiskId = riskId;

  const detailsHtml = `
    <div class="detail-group">
      <span class="detail-label">Risk ID</span>
      <span class="detail-value">${risk.id}</span>
    </div>
    <div class="detail-group">
      <span class="detail-label">Severity</span>
      <span class="detail-value"><span class="severity-${risk.severity}">${risk.severity.toUpperCase()}</span></span>
    </div>
    <div class="detail-group">
      <span class="detail-label">Status</span>
      <span class="detail-value"><span class="status-badge ${risk.status}">${risk.status}</span></span>
    </div>
    <div class="detail-group">
      <span class="detail-label">Detected</span>
      <span class="detail-value">${risk.time}</span>
    </div>
    <div class="detail-group" style="grid-column: 1 / -1;">
      <span class="detail-label">Risk Title</span>
      <span class="detail-value highlight">${risk.title}</span>
    </div>
    <div class="detail-group" style="grid-column: 1 / -1;">
      <span class="detail-label">Details</span>
      <span class="detail-value">${risk.text}</span>
    </div>
  `;

  document.getElementById('risk-detail-content').innerHTML = detailsHtml;
  document.getElementById('risk-detail-card').style.display = 'block';

  document.getElementById('investigate-btn').onclick = () => updateRiskStatus(riskId, 'investigating');
  document.getElementById('resolve-btn').onclick = () => updateRiskStatus(riskId, 'resolved');
  document.getElementById('flag-btn').onclick = () => alert('Risk flagged for further manual review.');

  document.getElementById('close-risk-detail').onclick = () => {
    document.getElementById('risk-detail-card').style.display = 'none';
  };
}

function updateRiskStatus(riskId, newStatus) {
  persistSharedState(state => {
    const risk = state.admin.riskAlerts.find(r => r.id === riskId);
    if (risk) {
      risk.status = newStatus;
    }
    return state;
  });

  alert(`Risk status updated to: ${newStatus}`);
  renderRisksView(sharedStore.read());
}

function renderAuditView(state) {
  const admin = state.admin;

  const tableHtml = `
    <table>
      <thead>
        <tr>
          <th>Log ID</th>
          <th>Time</th>
          <th>Actor</th>
          <th>Action</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        ${admin.auditLogs.map(log => `
          <tr>
            <td><strong>${log.id}</strong></td>
            <td>${log.time}</td>
            <td>${log.actor}</td>
            <td>${log.action}</td>
            <td>${log.details}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  document.getElementById('audit-table').innerHTML = tableHtml;
}

function updateMetrics() {
  const state = sharedStore.read();
  renderDashboard();
}

// Quick action listeners
function setupAdminEventListeners() {
  document.getElementById('view-pending-loans')?.addEventListener('click', () => switchAdminView('loans'));
  document.getElementById('create-admin-btn')?.addEventListener('click', () => {
    document.getElementById('create-admin-card').style.display = 'block';
  });
  document.getElementById('view-alerts-btn')?.addEventListener('click', () => switchAdminView('risks'));
  document.getElementById('new-admin-btn')?.addEventListener('click', () => {
    document.getElementById('create-admin-card').style.display = 'block';
  });

  document.getElementById('create-admin-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const newAdmin = {
      id: `ADM-${Date.now()}`,
      name: document.getElementById('admin-name').value,
      email: document.getElementById('admin-email').value,
      role: document.getElementById('admin-role').value,
      status: 'active',
      createdAt: new Date().toISOString().split('T')[0],
      lastLogin: 'Never'
    };

    persistSharedState(state => {
      state.admin.adminUsers.push(newAdmin);
      return state;
    });

    alert(`✓ Admin account created for ${newAdmin.name}`);
    document.getElementById('create-admin-card').style.display = 'none';
    document.getElementById('create-admin-form').reset();
    renderAdminsView(sharedStore.read());
  });

  document.getElementById('close-create-admin')?.addEventListener('click', () => {
    document.getElementById('create-admin-card').style.display = 'none';
  });

  document.getElementById('settings-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    persistSharedState(state => {
      state.admin.settings = {
        defaultInterestRate: parseFloat(document.getElementById('default-rate').value),
        maxLoanAmount: parseInt(document.getElementById('max-loan').value),
        minLoanAmount: parseInt(document.getElementById('min-loan').value),
        autoApprovalThreshold: parseInt(document.getElementById('auto-approval').value),
        paymentGracePeriod: parseInt(document.getElementById('grace-period').value)
      };
      return state;
    });
    alert('✓ Settings saved successfully!');
  });

  // Load settings
  syncSettingsForm(sharedStore.read());

  // Admin logout
  document.getElementById('admin-panel-logout-btn')?.addEventListener('click', handleAdminLogout);
}

function handleAdminLogout() {
  // Clear admin authentication
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('userRole');

  // Redirect to admin login
  window.location.href = 'admin-login.html';
}

function syncSettingsForm(state) {
  const settings = state?.admin?.settings;
  if (!settings) return;

  const defaultRate = document.getElementById('default-rate');
  const maxLoan = document.getElementById('max-loan');
  const minLoan = document.getElementById('min-loan');
  const autoApproval = document.getElementById('auto-approval');
  const gracePeriod = document.getElementById('grace-period');

  if (defaultRate) defaultRate.value = settings.defaultInterestRate;
  if (maxLoan) maxLoan.value = settings.maxLoanAmount;
  if (minLoan) minLoan.value = settings.minLoanAmount;
  if (autoApproval) autoApproval.value = settings.autoApprovalThreshold;
  if (gracePeriod) gracePeriod.value = settings.paymentGracePeriod;
}
