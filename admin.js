// SwiftLend Admin Panel JavaScript

// Admin State
const adminState = {
  metrics: {
    totalUsers: 12458,
    activeLoans: 3247,
    totalDisbursed: 4200000000,
    defaultRate: 3.2
  },
  applications: [
    { id: 1, user: 'John Doe', amount: 1200000, status: 'pending', score: 742 },
    { id: 2, user: 'Jane Smith', amount: 800000, status: 'pending', score: 680 },
    { id: 3, user: 'Mike Johnson', amount: 1500000, status: 'approved', score: 755 },
    { id: 4, user: 'Sarah Williams', amount: 650000, status: 'rejected', score: 520 }
  ],
  riskAlerts: [
    { id: 1, severity: 'high', title: 'Device Clustering', text: 'Multiple accounts from same device', time: '2 hours ago' },
    { id: 2, severity: 'medium', title: 'Unusual Pattern', text: 'Suspicious application pattern detected', time: '5 hours ago' },
    { id: 3, severity: 'medium', title: 'Repayment Anomaly', text: 'Multiple partial payments detected', time: '1 day ago' }
  ],
  users: [
    { id: 'USR001', name: 'John Doe', phone: '+256 7XX XXX XXX', kyc: 'verified', score: 742, loans: 2, joined: 'Jan 2024' },
    { id: 'USR002', name: 'Jane Smith', phone: '+256 7XX XXX XXX', kyc: 'verified', score: 680, loans: 1, joined: 'Feb 2024' },
    { id: 'USR003', name: 'Mike Johnson', phone: '+256 7XX XXX XXX', kyc: 'pending', score: 0, loans: 0, joined: 'Mar 2024' },
    { id: 'USR004', name: 'Sarah Williams', phone: '+256 7XX XXX XXX', kyc: 'rejected', score: 520, loans: 0, joined: 'Mar 2024' }
  ],
  loans: [
    { id: 'L2024125', user: 'John Doe', amount: 1200000, interest: 1.5, term: 6, status: 'pending', aiDecision: 'approve', aiScore: 742 },
    { id: 'L2024124', user: 'Jane Smith', amount: 800000, interest: 1.8, term: 4, status: 'approved', aiDecision: 'approve', aiScore: 680 },
    { id: 'L2024123', user: 'Mike Johnson', amount: 1500000, interest: 1.2, term: 12, status: 'disbursed', aiDecision: 'approve', aiScore: 755 },
    { id: 'L2024122', user: 'Sarah Williams', amount: 650000, interest: 2.0, term: 3, status: 'rejected', aiDecision: 'reject', aiScore: 520 }
  ],
  auditLogs: [
    { timestamp: 'Apr 29, 2024 10:45 AM', admin: 'Admin User', action: 'approval', target: 'Loan L2024125', details: 'Manual override', ip: '41.210.145.XX' },
    { timestamp: 'Apr 29, 2024 10:30 AM', admin: 'Admin User', action: 'kyc', target: 'User USR8847', details: 'KYC approved', ip: '41.210.145.XX' },
    { timestamp: 'Apr 29, 2024 10:15 AM', admin: 'System', action: 'system', target: 'Loan L2024124', details: 'Auto approved', ip: 'System' }
  ]
};

// Currency Formatter
const currencyFormatter = new Intl.NumberFormat('en-UG', {
  style: 'currency',
  currency: 'UGX',
  maximumFractionDigits: 0
});

// Initialize Admin Panel
document.addEventListener('DOMContentLoaded', () => {
  initializeAdmin();
  setupAdminEventListeners();
});

// Initialize Admin
function initializeAdmin() {
  updateMetrics();
  populateApplications();
  populateRiskAlerts();
  populateUsersTable();
  populateLoansTable();
  initializeAdminCharts();
}

// Update Metrics
function updateMetrics() {
  const { metrics } = adminState;
  document.getElementById('total-users').textContent = metrics.totalUsers.toLocaleString();
  document.getElementById('active-loans').textContent = metrics.activeLoans.toLocaleString();
  document.getElementById('total-disbursed').textContent = 'UGX ' + (metrics.totalDisbursed / 1000000000).toFixed(1) + 'B';
  document.getElementById('default-rate').textContent = metrics.defaultRate + '%';
}

// Populate Applications
function populateApplications() {
  const list = document.getElementById('applications-list');
  if (!list) return;
  
  list.innerHTML = adminState.applications.slice(0, 5).map(app => `
    <div class="application-item">
      <div class="app-info">
        <span class="app-user">${app.user}</span>
        <span class="app-amount">${currencyFormatter.format(app.amount)}</span>
      </div>
      <div class="app-status">
        <span class="status-badge ${app.status}">${app.status}</span>
      </div>
    </div>
  `).join('');
}

// Populate Risk Alerts
function populateRiskAlerts() {
  const list = document.getElementById('risk-alerts-list');
  if (!list) return;
  
  list.innerHTML = adminState.riskAlerts.map(alert => `
    <div class="alert-item ${alert.severity}">
      <div class="alert-icon ${alert.severity === 'high' ? 'danger' : 'warning'}">!</div>
      <div class="alert-content">
        <p class="alert-title">${alert.title}</p>
        <p class="alert-text">${alert.text}</p>
      </div>
    </div>
  `).join('');
}

// Populate Users Table
function populateUsersTable() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;
  
  tbody.innerHTML = adminState.users.map(user => `
    <tr>
      <td><input type="checkbox"></td>
      <td>
        <div class="user-cell">
          <span class="user-name">${user.name}</span>
          <span class="user-id">${user.id}</span>
        </div>
      </td>
      <td>${user.phone}</td>
      <td><span class="status-badge ${user.kyc}">${user.kyc}</span></td>
      <td>${user.score > 0 ? user.score : '-'}</td>
      <td>${user.loans}</td>
      <td>${user.joined}</td>
      <td>
        <button class="text-button" onclick="viewUser('${user.id}')">View</button>
      </td>
    </tr>
  `).join('');
}

// Populate Loans Table
function populateLoansTable() {
  const tbody = document.getElementById('loans-table-body');
  if (!tbody) return;
  
  tbody.innerHTML = adminState.loans.map(loan => `
    <tr>
      <td>${loan.id}</td>
      <td>${loan.user}</td>
      <td>${currencyFormatter.format(loan.amount)}</td>
      <td>${loan.interest}%</td>
      <td>${loan.term} mo</td>
      <td><span class="status-badge ${loan.status}">${loan.status}</span></td>
      <td>
        <div class="ai-decision">
          <span class="decision-badge ${loan.aiDecision}">${loan.aiDecision}</span>
          <span>${loan.aiScore}</span>
        </div>
      </td>
      <td>
        <button class="text-button" onclick="openLoanAction('${loan.id}')">Action</button>
      </td>
    </tr>
  `).join('');
}

// Initialize Admin Charts
function initializeAdminCharts() {
  initializeRevenueChart();
  initializeUserDistChart();
  initializeModelPerformanceChart();
  initializeRepaymentChart();
  initializeRevenueBreakdownChart();
}

// Revenue Chart
function initializeRevenueChart() {
  const canvas = document.getElementById('revenue-chart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  canvas.width = 500;
  canvas.height = 200;
  
  ctx.fillStyle = '#f5f7f8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  const data = [
    { month: 'Jan', revenue: 45000000 },
    { month: 'Feb', revenue: 52000000 },
    { month: 'Mar', revenue: 61000000 },
    { month: 'Apr', revenue: 55000000 }
  ];
  
  const maxRevenue = 70000000;
  const barWidth = 80;
  const gap = 30;
  const startX = 40;
  const chartHeight = 150;
  
  data.forEach((item, index) => {
    const barHeight = (item.revenue / maxRevenue) * chartHeight;
    const x = startX + index * (barWidth + gap);
    const y = 170 - barHeight;
    
    const gradient = ctx.createLinearGradient(x, y, x, 170);
    gradient.addColorStop(0, '#0d8b63');
    gradient.addColorStop(1, '#18aa79');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barHeight, 8);
    ctx.fill();
    
    ctx.fillStyle = '#5f7165';
    ctx.font = '12px Manrope';
    ctx.textAlign = 'center';
    ctx.fillText(item.month, x + barWidth / 2, 190);
  });
}

// User Distribution Chart
function initializeUserDistChart() {
  const canvas = document.getElementById('user-dist-chart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  canvas.width = 200;
  canvas.height = 150;
  
  const centerX = 100;
  const centerY = 75;
  const radius = 60;
  
  const data = [
    { value: 68, color: '#0d8b63' },
    { value: 22, color: '#e6b84e' },
    { value: 10, color: '#dc3f3f' }
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
  ctx.arc(centerX, centerY, 30, 0, Math.PI * 2);
  ctx.fillStyle = '#f5f7f8';
  ctx.fill();
}

// Model Performance Chart
function initializeModelPerformanceChart() {
  const canvas = document.getElementById('model-performance-chart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  canvas.width = 300;
  canvas.height = 150;
  
  ctx.fillStyle = '#f5f7f8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  const data = [
    { week: 'W1', accuracy: 91 },
    { week: 'W2', accuracy: 92 },
    { week: 'W3', accuracy: 93 },
    { week: 'W4', accuracy: 94 }
  ];
  
  const maxVal = 100;
  const barWidth = 50;
  const gap = 20;
  const startX = 30;
  const chartHeight = 100;
  
  data.forEach((item, index) => {
    const barHeight = (item.accuracy / maxVal) * chartHeight;
    const x = startX + index * (barWidth + gap);
    const y = 130 - barHeight;
    
    ctx.fillStyle = '#0d8b63';
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barHeight, 6);
    ctx.fill();
  });
}

// Repayment Chart
function initializeRepaymentChart() {
  const canvas = document.getElementById('repayment-chart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  canvas.width = 350;
  canvas.height = 180;
  
  ctx.fillStyle = '#f5f7f8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  const data = [
    { month: 'Jan', onTime: 70, late: 20, default: 10 },
    { month: 'Feb', onTime: 72, late: 18, default: 10 },
    { month: 'Mar', onTime: 75, late: 15, default: 10 },
    { month: 'Apr', onTime: 72, late: 18, default: 10 }
  ];
  
  const barWidth = 60;
  const gap = 25;
  const startX = 30;
  const chartHeight = 120;
  
  data.forEach((item, index) => {
    const x = startX + index * (barWidth + gap);
    
    // Stacked bar
    const onTimeHeight = (item.onTime / 100) * chartHeight;
    const lateHeight = (item.late / 100) * chartHeight;
    const defaultHeight = (item.default / 100) * chartHeight;
    
    // Default (bottom)
    ctx.fillStyle = '#dc3f3f';
    ctx.fillRect(x, 140 - defaultHeight, barWidth, defaultHeight);
    
    // Late
    ctx.fillStyle = '#e6b84e';
    ctx.fillRect(x, 140 - defaultHeight - lateHeight, barWidth, lateHeight);
    
    // On-time (top)
    ctx.fillStyle = '#167a52';
    ctx.fillRect(x, 140 - defaultHeight - lateHeight - onTimeHeight, barWidth, onTimeHeight);
  });
}

// Revenue Breakdown Chart
function initializeRevenueBreakdownChart() {
  const canvas = document.getElementById('revenue-breakdown-chart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  canvas.width = 200;
  canvas.height = 200;
  
  const centerX = 100;
  const centerY = 100;
  const radius = 80;
  
  const data = [
    { value: 65, color: '#0d8b63' },
    { value: 12, color: '#e6b84e' },
    { value: 6, color: '#2a5968' },
    { value: 4, color: '#dc3f3f' },
    { value: 13, color: '#5f7165' }
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
  ctx.arc(centerX, centerY, 45, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

// Setup Event Listeners
function setupAdminEventListeners() {
  // Navigation
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', handleAdminNavigation);
  });
  
  // Mobile menu toggle
  document.querySelectorAll('.menu-toggle, .mobile-menu-btn').forEach(btn => {
    btn.addEventListener('click', toggleMobileSidebar);
  });
  
  // Sidebar overlay click to close
  document.getElementById('sidebar-overlay')?.addEventListener('click', closeMobileSidebar);
  
  // Sidebar menu items
  document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.dataset.view;
      handleAdminNavigation({ target: { dataset: { view: view } } });
      closeMobileSidebar();
    });
  });
  
  // Notification button
  document.getElementById('admin-notification-btn')?.addEventListener('click', toggleAdminNotificationPanel);
  document.getElementById('close-admin-notifications')?.addEventListener('click', toggleAdminNotificationPanel);
  
  // User modal
  document.getElementById('close-user-modal')?.addEventListener('click', closeUserModal);
  document.getElementById('approve-user')?.addEventListener('click', approveUser);
  document.getElementById('blacklist-user')?.addEventListener('click', blacklistUser);
  
  // Loan modal
  document.getElementById('close-loan-modal')?.addEventListener('click', closeLoanModal);
  document.getElementById('cancel-loan-action')?.addEventListener('click', closeLoanModal);
  document.getElementById('confirm-loan-action')?.addEventListener('click', confirmLoanAction);
  
  // Chart period buttons
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', handleAdminPeriodChange);
  });
  
  // Scoring config
  document.getElementById('save-scoring-config')?.addEventListener('click', saveScoringConfig);
  
  // Commission config
  document.getElementById('save-commission')?.addEventListener('click', saveCommission);
  
  // KYC filter
  document.getElementById('kyc-filter')?.addEventListener('change', filterUsers);
  
  // Loan status filter
  document.getElementById('loan-status-filter')?.addEventListener('change', filterLoans);
  
  // Global search
  document.getElementById('global-search')?.addEventListener('input', handleGlobalSearch);
  
  // Select all users
  document.getElementById('select-all-users')?.addEventListener('change', toggleSelectAllUsers);
  
  // Bulk approve
  document.getElementById('bulk-approve')?.addEventListener('click', bulkApproveUsers);
}

// Handle Admin Navigation
function handleAdminNavigation(e) {
  e.preventDefault();
  const view = e.target.dataset.view;
  if (view) {
    switchAdminView(view);
  }
}

// Switch Admin View
function switchAdminView(viewName) {
  // Update nav links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.view === viewName);
  });
  
  // Update view sections
  document.querySelectorAll('.view-section').forEach(section => {
    section.classList.toggle('active', section.id === `${viewName}-view`);
  });
}

// Toggle Admin Notification Panel
function toggleAdminNotificationPanel() {
  const panel = document.getElementById('admin-notification-panel');
  panel.classList.toggle('open');
}

// Toggle Mobile Sidebar
function toggleMobileSidebar() {
  const sidebar = document.querySelector('.admin-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.toggle('active');
  overlay.classList.toggle('active');
}

// Close Mobile Sidebar
function closeMobileSidebar() {
  const sidebar = document.querySelector('.admin-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.remove('active');
  overlay.classList.remove('active');
}

// View User
function viewUser(userId) {
  console.log('Viewing user:', userId);
  document.getElementById('user-detail-modal').classList.add('open');
}

// Close User Modal
function closeUserModal() {
  document.getElementById('user-detail-modal').classList.remove('open');
}

// Approve User
function approveUser() {
  alert('User approved successfully!');
  closeUserModal();
}

// Blacklist User
function blacklistUser() {
  if (confirm('Are you sure you want to blacklist this user?')) {
    alert('User has been blacklisted.');
    closeUserModal();
  }
}

// Open Loan Action
function openLoanAction(loanId) {
  document.getElementById('action-loan-id').textContent = loanId;
  document.getElementById('loan-action-modal').classList.add('open');
}

// Close Loan Modal
function closeLoanModal() {
  document.getElementById('loan-action-modal').classList.remove('open');
}

// Confirm Loan Action
function confirmLoanAction() {
  const action = document.getElementById('loan-action-select').value;
  const notes = document.getElementById('loan-action-notes').value;
  
  console.log('Loan action:', action, 'Notes:', notes);
  alert(`Loan ${action} successfully!`);
  closeLoanModal();
}

// Handle Admin Period Change
function handleAdminPeriodChange(e) {
  const period = e.target.dataset.period;
  
  // Update active button
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.period === period);
  });
  
  console.log('Updating chart for period:', period);
}

// Save Scoring Config
function saveScoringConfig() {
  alert('Scoring configuration saved successfully!');
}

// Save Commission
function saveCommission() {
  alert('Commission configuration saved successfully!');
}

// Filter Users
function filterUsers() {
  const filter = document.getElementById('kyc-filter').value;
  console.log('Filtering users by:', filter);
}

// Filter Loans
function filterLoans() {
  const filter = document.getElementById('loan-status-filter').value;
  console.log('Filtering loans by:', filter);
}

// Handle Global Search
function handleGlobalSearch(e) {
  const query = e.target.value.toLowerCase();
  console.log('Global search:', query);
}

// Toggle Select All Users
function toggleSelectAllUsers(e) {
  const checked = e.target.checked;
  document.querySelectorAll('#users-table-body input[type="checkbox"]').forEach(cb => {
    cb.checked = checked;
  });
}

// Bulk Approve Users
function bulkApproveUsers() {
  const selected = document.querySelectorAll('#users-table-body input[type="checkbox"]:checked');
  if (selected.length === 0) {
    alert('Please select users to approve.');
    return;
  }
  
  if (confirm(`Approve ${selected.length} selected users?`)) {
    alert(`${selected.length} users approved successfully!`);
  }
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { adminState, initializeAdmin };
}