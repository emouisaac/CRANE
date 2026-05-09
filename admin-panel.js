const currencyFormatter = new Intl.NumberFormat('en-UG', {
  style: 'currency',
  currency: 'UGX',
  maximumFractionDigits: 0,
});

const adminSession = window.CraneAdminSession;

const adminPanelState = {
  currentView: 'dashboard',
  adminRole: 'admin',
  selectedLoanId: null,
  selectedAdminId: null,
  selectedRiskId: null,
  selectedCustomerId: null,
  mobileNavOpen: false,
  portalData: {
    loans: [],
    customers: [],
    admin: {
      adminUsers: [],
      loanApplications: [],
      applications: [],
      riskAlerts: [],
      auditLogs: [],
      settings: {},
    },
  },
  filters: {
    loanStatus: 'all',
    loanSearch: '',
    customerStatus: 'all',
    customerSearch: '',
    riskSeverity: 'all',
    riskStatus: 'all',
    auditSearch: '',
    auditDate: 'all',
  },
};

const SITE_INTRO_DURATION_MS = 2100;
const INTRO_IDLE_TIME_MS = 10 * 60 * 1000;
let lastActivityTime = Date.now();

function getToken() {
  return localStorage.getItem('accessToken');
}

function getHeaders() {
  return {
    'Authorization': `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  };
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      ...getHeaders(),
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  
  if (!response.ok) {
    // If we get a 401, try to refresh the token
    if (response.status === 401) {
      try {
        console.log('Access token expired, attempting refresh...');
        await adminSession.refreshAccessToken();
        console.log('Token refreshed successfully, retrying request...');
        
        // Retry the original request with the new token
        const retryResponse = await fetch(path, {
          headers: {
            ...getHeaders(),
            ...(options.headers || {}),
          },
          ...options,
        });
        
        const retryData = await retryResponse.json().catch(() => ({}));
        if (!retryResponse.ok) {
          throw new Error(retryData.error || 'Request failed after token refresh');
        }
        return retryData;
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        throw new Error(data.error || 'Session expired. Please sign in again.');
      }
    }
    
    throw new Error(data.error || 'Request failed.');
  }

  return data;
}

function formatDateTime(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function formatDate(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

function getPortalState() {
  return adminPanelState.portalData;
}

function buildSharedStateSnapshot() {
  const state = getPortalState();
  const loans = Array.isArray(state.loans) ? state.loans : [];
  const adminPayload = state.admin || {};
  const totalRemainingBalance = loans.reduce((sum, loan) => sum + (Number(loan.remaining ?? loan.remainingBalance) || 0), 0);

  return {
    metadata: window.CraneSharedState?.read()?.metadata || { knownPhones: [] },
    admin: {
      applications: Array.isArray(adminPayload.loanApplications) ? adminPayload.loanApplications : [],
      adminUsers: Array.isArray(adminPayload.adminUsers) ? adminPayload.adminUsers : [],
      riskAlerts: Array.isArray(adminPayload.riskAlerts) ? adminPayload.riskAlerts : [],
      auditLogs: Array.isArray(adminPayload.auditLogs) ? adminPayload.auditLogs : [],
      settings: typeof adminPayload.settings === 'object' && adminPayload.settings ? adminPayload.settings : {},
    },
    loans,
    customers: Array.isArray(state.customers) ? state.customers : [],
    notifications: [],
    referrals: [],
    user: {
      remainingBalance: totalRemainingBalance,
    },
  };
}

async function syncSharedPortalState() {
  if (!window.CraneSharedState?.write) {
    return;
  }

  try {
    const snapshot = buildSharedStateSnapshot();
    await window.CraneSharedState.write(snapshot);
  } catch (error) {
    console.warn('Could not synchronize master admin portal state with shared state:', error);
  }
}

async function loadPortalState() {
  const payload = await apiRequest('/api/admin/portal-state');
  adminPanelState.adminRole = payload.role || adminPanelState.adminRole;
  adminPanelState.portalData = payload.state || adminPanelState.portalData;
  updateUIBasedOnRole(adminPanelState.adminRole);
  renderCurrentView();
  await syncSharedPortalState();
}

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

function initializeSiteIntro() {
  const intro = document.getElementById('site-intro');
  if (!intro) {
    document.body.classList.remove('intro-loading');
    document.body.classList.add('intro-complete');
    return;
  }

  const lastIntroTime = localStorage.getItem('lastIntroTime');
  const currentTime = Date.now();
  const shouldShowIntro = !lastIntroTime || (currentTime - parseInt(lastIntroTime, 10)) >= INTRO_IDLE_TIME_MS;

  if (!shouldShowIntro) {
    document.body.classList.remove('intro-loading');
    document.body.classList.add('intro-complete');
    intro.remove();
    return;
  }

  localStorage.setItem('lastIntroTime', currentTime.toString());
  lastActivityTime = currentTime;
  localStorage.setItem('lastActivityTime', currentTime.toString());

  const finishIntro = () => {
    intro.classList.add('is-hidden');
    document.body.classList.remove('intro-loading', 'intro-playing');
    document.body.classList.add('intro-complete');
    window.setTimeout(() => intro.remove(), 600);
  };

  window.requestAnimationFrame(() => {
    document.body.classList.add('intro-playing');
  });

  window.setTimeout(finishIntro, SITE_INTRO_DURATION_MS);
}

function updateUIBasedOnRole(role) {
  const isMasterAdmin = role === 'master_admin';
  const isRegularAdmin = role === 'admin';

  const titleElement = document.getElementById('admin-title');
  if (titleElement) {
    titleElement.textContent = isMasterAdmin ? 'Crane Credit Master Admin' : 'Crane Credit Admin Panel';
  }

  document.getElementById('nav-loans-link').style.display = 'block';
  document.getElementById('nav-admins-link').style.display = isMasterAdmin ? 'block' : 'none';
  document.getElementById('nav-customers-link').style.display = isRegularAdmin ? 'block' : 'none';
  document.getElementById('nav-chat-link').style.display = isRegularAdmin ? 'block' : 'none';
  document.getElementById('nav-audit-link').style.display = isMasterAdmin ? 'block' : 'none';
  document.getElementById('create-admin-btn')?.style.setProperty('display', isMasterAdmin ? 'inline-flex' : 'none');
  document.getElementById('new-admin-btn')?.style.setProperty('display', isMasterAdmin ? 'inline-flex' : 'none');
  document.querySelector('.footer-box[data-view="admins"]')?.style.setProperty('display', isMasterAdmin ? 'inline-flex' : 'none');
  document.querySelector('.footer-box[data-view="audit"]')?.style.setProperty('display', isMasterAdmin ? 'inline-flex' : 'none');

  const settingsSubmit = document.querySelector('#settings-form button[type="submit"]');
  if (settingsSubmit) {
    settingsSubmit.disabled = !isMasterAdmin;
  }
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

  document.querySelectorAll('.header-nav .nav-link[data-view]').forEach((link) => {
    const isActive = link.dataset.view === viewName;
    link.classList.toggle('active', isActive);
    link.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  document.querySelectorAll('.footer-box[data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === viewName);
  });

  document.querySelectorAll('.admin-view').forEach((view) => {
    view.classList.toggle('active', view.id === `${viewName}-view`);
  });

  renderCurrentView();

  if (window.innerWidth <= 768) {
    setMobileNavOpen(false);
  }
}

function renderCurrentView() {
  switch (adminPanelState.currentView) {
    case 'dashboard':
      renderDashboard();
      break;
    case 'loans':
      renderLoansView();
      break;
    case 'admins':
      renderAdminsView();
      break;
    case 'customers':
      renderCustomersView();
      break;
    case 'chat':
      renderChatView();
      break;
    case 'risks':
      renderRisksView();
      break;
    case 'settings':
      syncSettingsForm();
      break;
    case 'audit':
      renderAuditView();
      break;
  }
}

function getFilteredApplications() {
  const applications = getPortalState().admin.loanApplications || [];
  return applications.filter((application) => {
    const matchesStatus = adminPanelState.filters.loanStatus === 'all' || application.status === adminPanelState.filters.loanStatus;
    const search = adminPanelState.filters.loanSearch.trim().toLowerCase();
    const matchesSearch = !search || [
      application.id,
      application.borrower,
      application.phone,
      application.purpose,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(search));
    return matchesStatus && matchesSearch;
  });
}

function getFilteredCustomers() {
  const customers = getPortalState().customers || [];
  return customers.filter((customer) => {
    const matchesStatus = adminPanelState.filters.customerStatus === 'all' || customer.status === adminPanelState.filters.customerStatus;
    const search = adminPanelState.filters.customerSearch.trim().toLowerCase();
    const matchesSearch = !search || [
      customer.name,
      customer.phone,
      customer.email,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(search));
    return matchesStatus && matchesSearch;
  });
}

function getFilteredRisks() {
  const risks = getPortalState().admin.riskAlerts || [];
  return risks.filter((risk) => {
    const matchesSeverity = adminPanelState.filters.riskSeverity === 'all' || risk.severity === adminPanelState.filters.riskSeverity;
    const matchesStatus = adminPanelState.filters.riskStatus === 'all' || risk.status === adminPanelState.filters.riskStatus;
    return matchesSeverity && matchesStatus;
  });
}

function getFilteredAuditLogs() {
  const logs = getPortalState().admin.auditLogs || [];
  const search = adminPanelState.filters.auditSearch.trim().toLowerCase();
  const now = Date.now();

  return logs.filter((log) => {
    const matchesSearch = !search || [
      log.actor,
      log.action,
      log.details,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(search));

    if (!matchesSearch) return false;

    if (adminPanelState.filters.auditDate === 'all') return true;
    const logTime = new Date(log.time).getTime();
    if (Number.isNaN(logTime)) return true;

    if (adminPanelState.filters.auditDate === 'today') {
      return now - logTime <= 24 * 60 * 60 * 1000;
    }
    if (adminPanelState.filters.auditDate === 'week') {
      return now - logTime <= 7 * 24 * 60 * 60 * 1000;
    }
    if (adminPanelState.filters.auditDate === 'month') {
      return now - logTime <= 31 * 24 * 60 * 60 * 1000;
    }
    return true;
  });
}

function renderDashboard() {
  const state = getPortalState();
  const applications = state.admin.loanApplications || [];
  const pendingCount = applications.filter((application) => ['pending', 'under_review', 'pending_master_review', 'needs_documents'].includes(application.status)).length;
  const activeLoans = (state.loans || []).filter((loan) => loan.status === 'active').length;
  const riskCount = (state.admin.riskAlerts || []).filter((risk) => risk.status === 'open').length;

  document.getElementById('pending-count').textContent = String(pendingCount);
  document.getElementById('active-loans').textContent = String(activeLoans);
  document.getElementById('risk-count').textContent = String(riskCount);
  document.getElementById('admin-count').textContent = String((state.admin.adminUsers || []).length);
  document.getElementById('alert-count').textContent = String(riskCount);

  document.getElementById('recent-activities').innerHTML = (state.admin.auditLogs || []).slice(0, 6).map((log) => `
    <div class="activity-item">
      <div class="activity-info">
        <div class="activity-title">${log.action}</div>
        <div class="activity-actor">by ${log.actor}</div>
        <div class="activity-time">${formatDateTime(log.time)} - ${log.details || ''}</div>
      </div>
    </div>
  `).join('') || '<p>No audit activity has been recorded yet.</p>';
}

function renderLoansView() {
  const applications = getFilteredApplications();
  document.getElementById('loans-table').innerHTML = `
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
        ${applications.map((application) => `
          <tr class="table-row-clickable" onclick="viewLoanDetails('${application.id}')">
            <td><strong>${application.id}</strong></td>
            <td>${application.borrower}</td>
            <td>${currencyFormatter.format(application.amount)}</td>
            <td>${application.term} months</td>
            <td><strong>${application.score}</strong></td>
            <td><span class="status-badge ${application.status}">${application.status.replace(/_/g, ' ')}</span></td>
            <td>${formatDateTime(application.requestedAt)}</td>
            <td><button class="btn btn-primary" onclick="viewLoanDetails('${application.id}'); event.stopPropagation();">Review</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderLoanDetail(application) {
  adminPanelState.selectedLoanId = application.id;

  document.getElementById('loan-detail-content').innerHTML = `
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
      <span class="detail-value"><span class="status-badge ${application.status}">${application.status.replace(/_/g, ' ')}</span></span>
    </div>
    <div class="detail-group" style="grid-column: 1 / -1;">
      <span class="detail-label">Documents Submitted</span>
      <div class="documents-list">
        ${(application.documents || []).map((doc) => `<div class="document-item verified">${doc.replace(/_/g, ' ')}</div>`).join('')}
      </div>
    </div>
    ${application.rejectReason ? `
      <div class="detail-group" style="grid-column: 1 / -1;">
        <span class="detail-label">Rejection Reason</span>
        <span class="detail-value" style="color: var(--danger);">${application.rejectReason}</span>
      </div>
    ` : ''}
  `;

  const approveBtn = document.getElementById('approve-loan-btn');
  const rejectBtn = document.getElementById('reject-loan-btn');
  if (adminPanelState.adminRole === 'master_admin') {
    approveBtn.textContent = 'Approve Loan';
    rejectBtn.textContent = 'Reject Loan';
  } else {
    approveBtn.textContent = 'Start Review';
    rejectBtn.textContent = 'Escalate Rejection';
  }

  document.getElementById('loan-detail-card').style.display = 'block';
}

async function handleLoanPrimaryAction() {
  const loanId = adminPanelState.selectedLoanId;
  if (!loanId) return;

  if (adminPanelState.adminRole === 'master_admin') {
    const approvalNotes = prompt('Enter approval notes:', '') || '';
    await apiRequest(`/api/admin/loans/${loanId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approvalNotes }),
    });
    alert('Loan approved successfully.');
  } else {
    const notes = prompt('Enter review notes:', '') || '';
    await apiRequest(`/api/admin/loans/${loanId}/review`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
    alert('Application moved into review.');
  }

  document.getElementById('loan-detail-card').style.display = 'none';
  await loadPortalState();
}

async function handleLoanSecondaryAction() {
  const loanId = adminPanelState.selectedLoanId;
  if (!loanId) return;

  if (adminPanelState.adminRole === 'master_admin') {
    const rejectionNotes = prompt('Enter rejection reason:', '');
    if (!rejectionNotes) return;
    await apiRequest(`/api/admin/loans/${loanId}/reject-final`, {
      method: 'POST',
      body: JSON.stringify({ rejectionNotes }),
    });
    alert('Loan rejected.');
  } else {
    const rejectionReason = prompt('Enter rejection reason:', '');
    if (!rejectionReason) return;
    await apiRequest(`/api/admin/loans/${loanId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejectionReason }),
    });
    alert('Application escalated to master-admin review.');
  }

  document.getElementById('loan-detail-card').style.display = 'none';
  await loadPortalState();
}

async function requestMoreDocuments() {
  const loanId = adminPanelState.selectedLoanId;
  if (!loanId) return;

  const note = prompt('Enter the message for the borrower:', 'Please upload clearer or additional supporting documents.');
  if (!note) return;

  await apiRequest(`/api/admin/loans/${loanId}/request-more-docs`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
  alert('Document request sent to borrower.');
  document.getElementById('loan-detail-card').style.display = 'none';
  await loadPortalState();
}

function renderAdminsView() {
  const admins = getPortalState().admin.adminUsers || [];
  document.getElementById('admins-table').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Username</th>
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
        ${admins.map((admin) => `
          <tr class="table-row-clickable" onclick="editAdminUser('${admin.id}')">
            <td><strong>${admin.id}</strong></td>
            <td>${admin.username || '-'}</td>
            <td>${admin.name}</td>
            <td>${admin.email || '-'}</td>
            <td>${admin.role.replace(/_/g, ' ')}</td>
            <td><span class="status-badge ${admin.status}">${admin.status}</span></td>
            <td>${admin.createdAt}</td>
            <td>${admin.lastLogin}</td>
            <td><button class="btn btn-secondary" onclick="editAdminUser('${admin.id}'); event.stopPropagation();">Edit</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderCustomersView() {
  const customers = getFilteredCustomers();
  document.getElementById('customers-table').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Phone</th>
          <th>Status</th>
          <th>KYC</th>
          <th>Active Loans</th>
          <th>Repayment</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${customers.map((customer) => `
          <tr class="table-row-clickable" onclick="selectCustomer('${customer.id}')">
            <td>${customer.name}</td>
            <td>${customer.phone}</td>
            <td><span class="status-badge ${customer.status}">${customer.status}</span></td>
            <td>${customer.kycStatus.replace(/_/g, ' ')}</td>
            <td>${customer.activeLoans}</td>
            <td>${customer.repaymentStatus}</td>
            <td><button class="btn btn-secondary" onclick="selectCustomer('${customer.id}'); event.stopPropagation();">View</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderCustomerDetail(customer) {
  adminPanelState.selectedCustomerId = customer.id;
  document.getElementById('customer-detail-content').innerHTML = `
    <p><strong>Customer ID:</strong> ${customer.id}</p>
    <p><strong>Phone:</strong> ${customer.phone}</p>
    <p><strong>Email:</strong> ${customer.email || 'Not provided'}</p>
    <p><strong>Active Loans:</strong> ${customer.activeLoans}</p>
    <p><strong>Total Borrowed:</strong> ${currencyFormatter.format(customer.totalBorrowed || 0)}</p>
    <p><strong>Repayment Status:</strong> ${customer.repaymentStatus}</p>
    <p><strong>Registered:</strong> ${formatDateTime(customer.registeredAt)}</p>
  `;
  document.getElementById('customer-detail-card').style.display = 'block';
}

function renderChatView() {
  const customers = getPortalState().customers || [];
  document.getElementById('chat-customer-list').innerHTML = customers.map((customer) => `
    <button class="chat-list-item ${adminPanelState.selectedCustomerId === customer.id ? 'active' : ''}" onclick="openCustomerChat('${customer.id}')">
      <strong>${customer.name}</strong>
      <small>${customer.phone}</small>
    </button>
  `).join('') || '<p>No customers available yet.</p>';

  if (adminPanelState.selectedCustomerId) {
    loadChatMessages(adminPanelState.selectedCustomerId);
  }
}

async function loadChatMessages(customerId) {
  const customer = (getPortalState().customers || []).find((item) => item.id === customerId);
  if (customer) {
    document.getElementById('chat-customer-name').textContent = customer.name;
    document.getElementById('chat-customer-info').textContent = `${customer.phone} • ${customer.status}`;
  }

  const data = await apiRequest(`/api/admin/messages/${customerId}`);
  document.getElementById('chat-messages').innerHTML = (data.messages || []).map((message) => `
    <div class="message ${message.is_from_admin ? 'admin-message' : 'customer-message'}">
      <small>${formatDateTime(message.created_at)}</small>
      <p>${message.message_text}</p>
    </div>
  `).join('');
  document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight;
}

function renderRisksView() {
  const risks = getFilteredRisks();
  document.getElementById('risks-table').innerHTML = `
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
        ${risks.map((risk) => `
          <tr class="table-row-clickable" onclick="viewRiskDetails('${risk.id}')">
            <td><strong>${risk.id}</strong></td>
            <td><span class="severity-${risk.severity}">${risk.severity.toUpperCase()}</span></td>
            <td>${risk.title}</td>
            <td>${risk.text}</td>
            <td><span class="status-badge ${risk.status}">${risk.status}</span></td>
            <td>${formatDateTime(risk.time)}</td>
            <td><button class="btn btn-secondary" onclick="viewRiskDetails('${risk.id}'); event.stopPropagation();">Review</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderRiskDetail(risk) {
  adminPanelState.selectedRiskId = risk.id;
  document.getElementById('risk-detail-content').innerHTML = `
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
      <span class="detail-value">${formatDateTime(risk.time)}</span>
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
  document.getElementById('risk-detail-card').style.display = 'block';
}

function renderAuditView() {
  const logs = getFilteredAuditLogs();
  document.getElementById('audit-table').innerHTML = `
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
        ${logs.map((log) => `
          <tr>
            <td><strong>${log.id}</strong></td>
            <td>${formatDateTime(log.time)}</td>
            <td>${log.actor}</td>
            <td>${log.action}</td>
            <td>${log.details || ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function syncSettingsForm() {
  const settings = getPortalState().admin.settings || {};
  document.getElementById('default-rate').value = settings.defaultInterestRate ?? '';
  document.getElementById('max-loan').value = settings.maxLoanAmount ?? '';
  document.getElementById('min-loan').value = settings.minLoanAmount ?? '';
  document.getElementById('auto-approval').value = settings.autoApprovalThreshold ?? '';
  document.getElementById('grace-period').value = settings.paymentGracePeriod ?? '';
}

async function saveSettings(event) {
  event.preventDefault();
  if (adminPanelState.adminRole !== 'master_admin') {
    alert('Only the master admin can update platform settings.');
    return;
  }

  await apiRequest('/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify({
      defaultInterestRate: parseFloat(document.getElementById('default-rate').value),
      maxLoanAmount: parseInt(document.getElementById('max-loan').value, 10),
      minLoanAmount: parseInt(document.getElementById('min-loan').value, 10),
      autoApprovalThreshold: parseInt(document.getElementById('auto-approval').value, 10),
      paymentGracePeriod: parseInt(document.getElementById('grace-period').value, 10),
    }),
  });
  alert('Settings saved successfully.');
  await loadPortalState();
}

async function sendChatMessage() {
  const customerId = adminPanelState.selectedCustomerId;
  const input = document.getElementById('chat-message-input');
  const messageText = input?.value?.trim();

  if (!customerId || !messageText) {
    alert('Please select a customer and enter a message.');
    return;
  }

  await apiRequest('/api/admin/messages/send', {
    method: 'POST',
    body: JSON.stringify({
      userId: customerId,
      messageText,
      messageType: 'text',
    }),
  });

  input.value = '';
  await loadChatMessages(customerId);
}

async function updateRiskStatus(status) {
  if (!adminPanelState.selectedRiskId) return;
  await apiRequest(`/api/admin/risk-alerts/${adminPanelState.selectedRiskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  alert(`Risk updated to ${status}.`);
  document.getElementById('risk-detail-card').style.display = 'none';
  await loadPortalState();
}

async function handlePasswordReset() {
  if (!adminPanelState.selectedCustomerId) {
    alert('Please select a customer first.');
    return;
  }

  const reason = prompt('Enter reason for password reset:', 'User forgot password');
  if (!reason) return;

  const data = await apiRequest(`/api/admin/users/${adminPanelState.selectedCustomerId}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  alert(`Password reset initiated.\n\nToken: ${data.resetToken}\nExpires: ${formatDateTime(data.expiresAt)}`);
}

function generateAdminUsername(fullName) {
  const normalized = String(fullName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .join('.');
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${normalized || 'admin'}${suffix}`;
}

async function handleCreateAdmin(event) {
  event.preventDefault();

  const fullName = document.getElementById('admin-name').value.trim();
  const usernameInput = document.getElementById('admin-username');
  let username = usernameInput.value.trim();
  if (!username) {
    username = generateAdminUsername(fullName);
    usernameInput.value = username;
  }

  const payload = {
    fullName,
    username,
    email: document.getElementById('admin-email').value.trim(),
    role: document.getElementById('admin-role').value,
    password: document.getElementById('admin-password').value,
  };

  await apiRequest('/api/auth/admin/accounts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  alert(`Admin account created for ${payload.fullName}. Username: ${payload.username}`);
  document.getElementById('create-admin-card').style.display = 'none';
  document.getElementById('create-admin-form').reset();
  await loadPortalState();
}

function editAdminUser(adminId) {
  const admin = (getPortalState().admin.adminUsers || []).find((item) => item.id === adminId);
  if (!admin) return;

  adminPanelState.selectedAdminId = adminId;
  document.getElementById('edit-admin-name').value = admin.name;
  document.getElementById('edit-admin-username').value = admin.username || '';
  document.getElementById('edit-admin-email').value = admin.email || '';
  document.getElementById('edit-admin-role').value = admin.role;
  document.getElementById('edit-admin-status').value = admin.status;
  document.getElementById('edit-admin-card').style.display = 'block';
}

async function handleEditAdmin(event) {
  event.preventDefault();
  if (!adminPanelState.selectedAdminId) return;

  const newPassword = document.getElementById('edit-admin-password').value.trim();
  
  // Validate password if provided
  if (newPassword && newPassword.length < 6) {
    alert('New password must be at least 6 characters');
    return;
  }

  const updates = {
    role: document.getElementById('edit-admin-role').value,
    status: document.getElementById('edit-admin-status').value,
  };

  // Only include password if provided
  if (newPassword) {
    updates.password = newPassword;
  }

  try {
    await apiRequest(`/api/auth/admin/accounts/${adminPanelState.selectedAdminId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });

    const statusMsg = updates.password 
      ? `Admin account updated and password changed successfully.`
      : `Admin account updated successfully.`;
    
    alert(statusMsg);
    document.getElementById('edit-admin-card').style.display = 'none';
    document.getElementById('edit-admin-password').value = '';
    await loadPortalState();
  } catch (error) {
    alert(`Error updating admin: ${error.message}`);
  }
}

async function handleDeleteAdmin() {
  if (!adminPanelState.selectedAdminId) return;
  
  const admin = (getPortalState().admin.adminUsers || []).find((item) => item.id === adminPanelState.selectedAdminId);
  if (!admin) return;

  const currentStatus = admin.status;
  const actionText = currentStatus === 'suspended' ? 'reactivate' : 'suspend';
  const confirmMsg = currentStatus === 'suspended' 
    ? `Reactivate admin account for ${admin.name}? They will regain access.`
    : `Suspend admin account for ${admin.name}? They will lose access immediately.`;

  if (!window.confirm(confirmMsg)) return;

  try {
    const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
    await apiRequest(`/api/auth/admin/accounts/${adminPanelState.selectedAdminId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });

    const successMsg = currentStatus === 'suspended' 
      ? `Admin account ${admin.name} has been reactivated.`
      : `Admin account ${admin.name} has been suspended.`;
    
    alert(successMsg);
    document.getElementById('edit-admin-card').style.display = 'none';
    await loadPortalState();
  } catch (error) {
    alert(`Error updating account: ${error.message}`);
  }
}

function selectCustomer(customerId) {
  const customer = (getPortalState().customers || []).find((item) => item.id === customerId);
  if (!customer) return;
  renderCustomerDetail(customer);
}

function openCustomerChat(customerId) {
  adminPanelState.selectedCustomerId = customerId;
  switchAdminView('chat');
}

function viewLoanDetails(loanId) {
  const application = (getPortalState().admin.loanApplications || []).find((item) => item.id === loanId);
  if (!application) return;
  renderLoanDetail(application);
}

function viewRiskDetails(riskId) {
  const risk = (getPortalState().admin.riskAlerts || []).find((item) => item.id === riskId);
  if (!risk) return;
  renderRiskDetail(risk);
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function handleSettingsUtility(event) {
  const label = event.currentTarget.textContent.trim();

  if (label === 'Backup Database' || label === 'Export All Data' || label === 'Export Report') {
    downloadJson(`crane-${label.toLowerCase().replace(/\s+/g, '-')}.json`, getPortalState());
    return;
  }

  if (label === 'System Health Check') {
    const response = await fetch('/health');
    const data = await response.json();
    alert(`Health check complete.\n\nService: ${data.service}\nTime: ${data.time}`);
    return;
  }

  if (label === 'Clear Cache') {
    await loadPortalState();
    alert('Panel data reloaded from the server.');
    return;
  }

  if (label === 'View Login History') {
    switchAdminView('audit');
    return;
  }

  if (label === 'Reset Master Password') {
    alert('Master-admin credentials are controlled through the secure deployment environment. Update ADMIN_PASSWORD in your server environment to rotate it safely.');
    return;
  }

  if (label === 'Enable Two-Factor Auth') {
    alert('Two-factor authentication is not wired into this deployment yet. Use strong environment secrets and admin account hygiene until 2FA is added.');
    return;
  }

  if (label === 'Manage API Keys') {
    alert('API keys are managed server-side through environment variables for this deployment.');
  }
}

function setupNavigation() {
  document.querySelectorAll('.header-nav .nav-link[data-view]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      switchAdminView(link.dataset.view);
    });
  });

  document.querySelectorAll('.metric-card[data-view]').forEach((card) => {
    card.addEventListener('click', () => {
      const view = card.dataset.view;
      const filter = card.dataset.filter;
      if (view === 'loans' && filter) {
        adminPanelState.filters.loanStatus = filter;
        const loanStatusFilter = document.getElementById('loan-status-filter');
        if (loanStatusFilter) {
          loanStatusFilter.value = filter;
        }
      }
      switchAdminView(view);
    });
  });

  document.querySelectorAll('.footer-box[data-view]').forEach((button) => {
    button.addEventListener('click', () => switchAdminView(button.dataset.view));
  });

  document.getElementById('admin-panel-home-btn')?.addEventListener('click', () => switchAdminView('dashboard'));
  document.getElementById('admin-panel-menu-toggle')?.addEventListener('click', () => setMobileNavOpen(!adminPanelState.mobileNavOpen));
  document.getElementById('admin-panel-nav-overlay')?.addEventListener('click', () => setMobileNavOpen(false));
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768 && adminPanelState.mobileNavOpen) {
      setMobileNavOpen(false);
    }
  });
}

function setupFilters() {
  document.getElementById('loan-status-filter')?.addEventListener('change', (event) => {
    adminPanelState.filters.loanStatus = event.target.value;
    renderLoansView();
  });
  document.getElementById('loan-search')?.addEventListener('input', (event) => {
    adminPanelState.filters.loanSearch = event.target.value;
    renderLoansView();
  });

  document.getElementById('customer-status-filter')?.addEventListener('change', (event) => {
    adminPanelState.filters.customerStatus = event.target.value;
    renderCustomersView();
  });
  document.getElementById('customer-search')?.addEventListener('input', (event) => {
    adminPanelState.filters.customerSearch = event.target.value;
    renderCustomersView();
  });

  document.getElementById('risk-severity-filter')?.addEventListener('change', (event) => {
    adminPanelState.filters.riskSeverity = event.target.value;
    renderRisksView();
  });
  document.getElementById('risk-status-filter')?.addEventListener('change', (event) => {
    adminPanelState.filters.riskStatus = event.target.value;
    renderRisksView();
  });

  document.getElementById('audit-search')?.addEventListener('input', (event) => {
    adminPanelState.filters.auditSearch = event.target.value;
    renderAuditView();
  });
  document.getElementById('audit-date-filter')?.addEventListener('change', (event) => {
    adminPanelState.filters.auditDate = event.target.value;
    renderAuditView();
  });
}

function setupActionButtons() {
  document.getElementById('view-pending-loans')?.addEventListener('click', () => {
    adminPanelState.filters.loanStatus = 'pending';
    document.getElementById('loan-status-filter').value = 'pending';
    switchAdminView('loans');
  });
  document.getElementById('view-alerts-btn')?.addEventListener('click', () => switchAdminView('risks'));
  document.getElementById('create-admin-btn')?.addEventListener('click', () => {
    if (adminPanelState.adminRole !== 'master_admin') {
      alert('Only the master admin can create admin accounts.');
      return;
    }
    document.getElementById('create-admin-card').style.display = 'block';
  });
  document.getElementById('new-admin-btn')?.addEventListener('click', () => {
    if (adminPanelState.adminRole !== 'master_admin') {
      alert('Only the master admin can create admin accounts.');
      return;
    }
    document.getElementById('create-admin-card').style.display = 'block';
  });
  document.getElementById('generate-admin-username-btn')?.addEventListener('click', () => {
    const fullName = document.getElementById('admin-name').value.trim();
    if (!fullName) {
      alert('Enter the full name first to generate a username.');
      return;
    }
    document.getElementById('admin-username').value = generateAdminUsername(fullName);
  });
  document.getElementById('admin-logout-btn')?.addEventListener('click', () => {
    adminSession.clearSession();
    adminSession.redirectToLogin('master_admin');
  });
  document.getElementById('export-report-btn')?.addEventListener('click', handleSettingsUtility);
  document.getElementById('admin-panel-sync-btn')?.addEventListener('click', loadPortalState);
  document.getElementById('admin-panel-alerts-btn')?.addEventListener('click', () => switchAdminView('risks'));

  document.getElementById('close-loan-detail')?.addEventListener('click', () => {
    document.getElementById('loan-detail-card').style.display = 'none';
  });
  document.getElementById('approve-loan-btn')?.addEventListener('click', async () => {
    try {
      await handleLoanPrimaryAction();
    } catch (error) {
      alert(error.message);
    }
  });
  document.getElementById('reject-loan-btn')?.addEventListener('click', async () => {
    try {
      await handleLoanSecondaryAction();
    } catch (error) {
      alert(error.message);
    }
  });
  document.getElementById('request-more-docs-btn')?.addEventListener('click', async () => {
    try {
      await requestMoreDocuments();
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById('create-admin-form')?.addEventListener('submit', async (event) => {
    try {
      await handleCreateAdmin(event);
    } catch (error) {
      alert(error.message);
    }
  });
  document.getElementById('edit-admin-form')?.addEventListener('submit', async (event) => {
    try {
      await handleEditAdmin(event);
    } catch (error) {
      alert(error.message);
    }
  });
  document.getElementById('delete-admin-btn')?.addEventListener('click', async () => {
    try {
      await handleDeleteAdmin();
    } catch (error) {
      alert(error.message);
    }
  });
  document.getElementById('close-create-admin')?.addEventListener('click', () => {
    document.getElementById('create-admin-card').style.display = 'none';
  });
  document.getElementById('close-edit-admin')?.addEventListener('click', () => {
    document.getElementById('edit-admin-card').style.display = 'none';
  });

  document.getElementById('close-customer-detail')?.addEventListener('click', () => {
    document.getElementById('customer-detail-card').style.display = 'none';
  });
  document.getElementById('reset-password-btn')?.addEventListener('click', async () => {
    try {
      await handlePasswordReset();
    } catch (error) {
      alert(error.message);
    }
  });
  document.getElementById('view-loans-btn')?.addEventListener('click', () => {
    switchAdminView('loans');
  });
  document.getElementById('open-chat-btn')?.addEventListener('click', () => {
    if (adminPanelState.selectedCustomerId) {
      switchAdminView('chat');
    }
  });

  document.getElementById('send-message-btn')?.addEventListener('click', async () => {
    try {
      await sendChatMessage();
    } catch (error) {
      alert(error.message);
    }
  });
  document.getElementById('chat-message-input')?.addEventListener('keypress', async (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      try {
        await sendChatMessage();
      } catch (error) {
        alert(error.message);
      }
    }
  });

  document.getElementById('close-risk-detail')?.addEventListener('click', () => {
    document.getElementById('risk-detail-card').style.display = 'none';
  });
  document.getElementById('investigate-btn')?.addEventListener('click', async () => {
    try {
      await updateRiskStatus('investigating');
    } catch (error) {
      alert(error.message);
    }
  });
  document.getElementById('resolve-btn')?.addEventListener('click', async () => {
    try {
      await updateRiskStatus('resolved');
    } catch (error) {
      alert(error.message);
    }
  });
  document.getElementById('flag-btn')?.addEventListener('click', async () => {
    try {
      await updateRiskStatus('open');
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById('settings-form')?.addEventListener('submit', async (event) => {
    try {
      await saveSettings(event);
    } catch (error) {
      alert(error.message);
    }
  });

  document.querySelectorAll('.settings-options .btn').forEach((button) => {
    button.addEventListener('click', async (event) => {
      try {
        await handleSettingsUtility(event);
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!adminSession.ensurePanelAccess('master_admin')) {
    return;
  }

  const { adminRole } = adminSession.readSession();
  adminPanelState.adminRole = adminRole || 'master_admin';
  initializeSiteIntro();
  setupNavigation();
  setupFilters();
  setupActionButtons();
  setupIdleDetection();

  try {
    await loadPortalState();
  } catch (error) {
    console.error('Failed to load admin portal state:', error);
    console.error('Error details:', error.message);
    
    // Clear session to prevent redirect loop
    adminSession.clearSession();
    
    // Wait a moment to ensure localStorage is cleared
    await new Promise(resolve => setTimeout(resolve, 100));
    
    alert('We could not load the admin portal data. Please sign in again.');
    adminSession.redirectToLogin('master_admin', 'replace');
  }
});

window.switchAdminView = switchAdminView;
window.viewLoanDetails = viewLoanDetails;
window.editAdminUser = editAdminUser;
window.selectCustomer = selectCustomer;
window.openCustomerChat = openCustomerChat;
window.viewRiskDetails = viewRiskDetails;
