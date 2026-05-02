// SwiftLend Dashboard JavaScript

// Dashboard State
const dashboardState = {
  user: {
    name: 'John Doe',
    initials: 'JD',
    creditScore: 742,
    loyaltyTier: 'Gold',
    totalBorrowed: 2500000,
    remainingBalance: 1850000,
    nextDueDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000)
  },
  loans: [
    {
      id: 'L2024001',
      amount: 1200000,
      remaining: 850000,
      interest: 1.5,
      status: 'active',
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      term: 6,
      paidInstallments: 3
    },
    {
      id: 'L2024002',
      amount: 650000,
      remaining: 450000,
      interest: 1.8,
      status: 'active',
      dueDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
      term: 4,
      paidInstallments: 1
    },
    {
      id: 'L2023045',
      amount: 500000,
      remaining: 0,
      interest: 1.5,
      status: 'completed',
      dueDate: null,
      term: 3,
      paidInstallments: 3
    }
  ],
  notifications: [
    { id: 1, type: 'success', title: 'Limit Unlocked', text: 'Your clean repayment record is opening bigger offers.', time: 'Live', unread: true },
    { id: 2, type: 'warning', title: 'Rate Window', text: 'Pay early to keep your best rate active.', time: 'Today', unread: true },
    { id: 3, type: 'info', title: 'Hot Trend', text: 'Short-term business loans are moving fastest this week.', time: 'Trend', unread: false },
    { id: 4, type: 'success', title: 'Fast Cash', text: 'Verified repeat borrowers are getting cash in under 15 minutes.', time: 'Now', unread: false }
  ],
  referrals: [
    { name: 'Sarah K.', date: 'Apr 15, 2024', level: 1, earned: 50000, status: 'paid' },
    { name: 'Mike R.', date: 'Apr 10, 2024', level: 1, earned: 50000, status: 'paid' },
    { name: 'Jane D.', date: 'Apr 5, 2024', level: 2, earned: 25000, status: 'pending' }
  ],
  paymentHistory: [
    { date: 'W1', amount: 1800000 },
    { date: 'W2', amount: 2350000 },
    { date: 'W3', amount: 3100000 },
    { date: 'W4', amount: 4200000 }
  ],
  scoreHistory: [
    { month: 'Nov', score: 680 },
    { month: 'Dec', score: 695 },
    { month: 'Jan', score: 710 },
    { month: 'Feb', score: 725 },
    { month: 'Mar', score: 730 },
    { month: 'Apr', score: 742 }
  ],
  marketing: {
    offers: [
      {
        title: 'Growth Boost',
        amount: 5000000,
        rate: '1.2% monthly',
        term: '12 months',
        installment: 480000,
        payout: '14 minutes',
        message: 'Use it while your best rate is still live.',
        blurb: 'Great for stock, school fees, or urgent cashflow.',
        progress: 72
      },
      {
        title: 'Fast Flex',
        amount: 3200000,
        rate: '1.5% monthly',
        term: '6 months',
        installment: 565000,
        payout: '11 minutes',
        message: 'Bridge the gap and keep moving today.',
        blurb: 'Ideal for short-term needs and emergency expenses.',
        progress: 81
      },
      {
        title: 'Premium Lift',
        amount: 7800000,
        rate: '1.1% monthly',
        term: '18 months',
        installment: 505000,
        payout: '18 minutes',
        message: 'Borrow bigger with more breathing room.',
        blurb: 'Built for expansion, equipment, and bigger goals.',
        progress: 88
      }
    ],
    tickerMessages: [
      'Clean repayment streaks are unlocking bigger limits right now.',
      'Early repayments are helping more users save on interest.',
      'Repeat borrowers are getting quicker approvals this hour.'
    ],
    pulse: {
      approvedToday: 128,
      averageTicket: 'UGX 1.8M',
      sameDay: '94%',
      rating: '4.9/5',
      approvalRate: '92%',
      payoutSpeed: '14 min',
      repeatBorrowers: '68%'
    }
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

let marketingOfferIndex = 0;
let marketingTickerIndex = 0;
let marketingRefreshCountdown = 12;
let sectionWaveAnimationFrame = null;
let sectionWaveResizeHandlerAttached = false;
let mobileMenuIsOpen = false;
let liveStatsInterval = null;

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
  hydrateDashboardFromSharedState();
  initializeDashboard();
  initializeSectionWaveNet();
  setupEventListeners();
  startRealTimeUpdates();

  window.addEventListener('storage', (event) => {
    if (event.key === dashboardSharedStore?.STORAGE_KEY) {
      hydrateDashboardFromSharedState();
      initializeDashboard();
    }
  });
});

// Initialize Dashboard
function initializeDashboard() {
  updateWelcomeHeader();
  updateLoanBalance();
  updateHeroStats();
  initializeMarketingDashboard();
  populateLoansList();
  populateNotifications();
  populateLoanDetails('all');
  initializeCharts();
  updateCountdown();
  syncDashboardToSharedState();
}

function hydrateDashboardFromSharedState() {
  if (!dashboardSharedStore) return;

  const sharedState = dashboardSharedStore.read();
  if (!sharedState) return;

  dashboardState.user = {
    ...dashboardState.user,
    ...sharedState.user,
    nextDueDate: sharedState.user?.nextDueDate ? new Date(sharedState.user.nextDueDate) : dashboardState.user.nextDueDate
  };

  dashboardState.loans = (sharedState.loans || []).map((loan) => ({
    ...loan,
    dueDate: loan.dueDate ? new Date(loan.dueDate) : null
  }));

  dashboardState.notifications = Array.isArray(sharedState.notifications)
    ? sharedState.notifications.map((notification) => ({ ...notification }))
    : dashboardState.notifications;

  dashboardState.referrals = Array.isArray(sharedState.referrals)
    ? sharedState.referrals.map((referral) => ({ ...referral }))
    : dashboardState.referrals;

  if (sharedState.marketing) {
    dashboardState.marketing = {
      ...dashboardState.marketing,
      ...sharedState.marketing,
      pulse: {
        ...dashboardState.marketing.pulse,
        ...(sharedState.marketing.pulse || {})
      }
    };
  }
}

function syncDashboardToSharedState() {
  if (!dashboardSharedStore) return;

  dashboardSharedStore.update((state) => ({
    ...state,
    user: {
      ...state.user,
      ...dashboardState.user,
      nextDueDate: dashboardState.user.nextDueDate instanceof Date
        ? dashboardState.user.nextDueDate.toISOString()
        : dashboardState.user.nextDueDate
    },
    loans: dashboardState.loans.map((loan) => ({
      ...loan,
      borrowerName: loan.borrowerName || dashboardState.user.name,
      dueDate: loan.dueDate instanceof Date ? loan.dueDate.toISOString() : loan.dueDate
    })),
    notifications: dashboardState.notifications.map((notification) => ({ ...notification })),
    referrals: dashboardState.referrals.map((referral) => ({ ...referral })),
    marketing: {
      ...state.marketing,
      ...dashboardState.marketing,
      pulse: {
        ...(state.marketing?.pulse || {}),
        ...dashboardState.marketing.pulse
      }
    }
  }));
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
    const lineColor = 'rgba(255, 255, 255, 0.24)';

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

    sectionWaveAnimationFrame = requestAnimationFrame(drawWaveNet);
  };

  sectionWaveAnimationFrame = requestAnimationFrame(drawWaveNet);
}

// Update Welcome Header
function updateWelcomeHeader() {
  const userNameElement = document.getElementById('user-name');
  if (userNameElement && dashboardState.user.name) {
    // Show only the last name
    const lastName = dashboardState.user.name.split(' ').pop();
    userNameElement.textContent = lastName;
    // Removed font size adjustment to keep consistent with "Welcome" text
  }
}

// Update Loan Balance Display
function updateLoanBalance() {
  const balanceElement = document.getElementById('loan-balance-amount');
  if (balanceElement && dashboardState.user.remainingBalance) {
    balanceElement.textContent = currencyFormatter.format(dashboardState.user.remainingBalance);
  }
}

// Update Hero Stats
function updateHeroStats() {
  const { user } = dashboardState;
  setText('total-borrowed', currencyFormatter.format(user.totalBorrowed));
  setText('remaining-balance', currencyFormatter.format(user.remainingBalance));
  setText('credit-score-display', user.creditScore);
}

// Initialize Marketing Dashboard
function initializeMarketingDashboard() {
  updateMarketingPulse();
  updateActiveOffer();
  updateMarketingTicker();
  // Removed renderOfferCountdown since we don't have automatic refreshes
  setupMarketingRotation();
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
  marketingOfferIndex = (marketingOfferIndex + 1) % dashboardState.marketing.offers.length;
  // Removed countdown reset since we don't have automatic refreshes
  updateActiveOffer();
  // Removed renderOfferCountdown call
  animateOfferChange();
}

function updateMarketingTicker() {
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

  loansList.innerHTML = dashboardState.loans.filter(loan => loan.status === 'active').map(loan => `
    <div class="loan-item" data-loan-id="${loan.id}">
      <div class="loan-info">
        <span class="loan-id">${loan.id}</span>
        <span class="loan-amount">${currencyFormatter.format(loan.amount)}</span>
      </div>
      <div class="loan-status">
        <span class="status-dot ${loan.status}"></span>
        <span class="status-text ${loan.status}">${loan.status.charAt(0).toUpperCase() + loan.status.slice(1)}</span>
      </div>
    </div>
  `).join('');
}

// Populate Loan Details
function populateLoanDetails(status = 'all') {
  const detailList = document.getElementById('loans-detail-list');
  if (!detailList) return;

  const loans = dashboardState.loans;
  const activeLoans = loans.filter(loan => loan.status === 'active');
  const overdueLoans = loans.filter(loan => loan.status === 'overdue');
  const completedLoans = loans.filter(loan => loan.status === 'completed');
  const totalBorrowed = loans.reduce((sum, loan) => sum + loan.amount, 0);
  const remainingBalance = loans.reduce((sum, loan) => sum + loan.remaining, 0);

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
    content += loans.map(createLoanDetailItem).join('');
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
          currencyFormatter.format(dashboardState.user.totalBorrowed),
          'No overdue loan is on this profile right now, so this tab highlights your full borrowed position.',
          [
            { label: 'Remaining balance', value: currencyFormatter.format(dashboardState.user.remainingBalance) },
            { label: 'Next due in', value: document.getElementById('next-due-countdown')?.textContent || '12d 5h' },
            { label: 'Credit score', value: `${dashboardState.user.creditScore}` }
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
  const { user } = dashboardState;
  const now = new Date();
  const diff = user.nextDueDate - now;
  const countdownElement = document.getElementById('next-due-countdown');
  if (!countdownElement) return;
  
  if (diff > 0) {
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    countdownElement.textContent = `${days}d ${hours}h`;
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Home footer button
  document.getElementById('home-nav-btn')?.addEventListener('click', () => {
    switchView('overview');
  });

  // Footer money/loans button
  document.getElementById('footer-money-btn')?.addEventListener('click', () => {
    switchView('loans');
  });

  // Footer chat button
  document.getElementById('footer-chat-btn')?.addEventListener('click', () => {
    alert('Chat support feature would be implemented here.\n\nThis would open a chat interface for customer support, loan inquiries, or general assistance.');
  });

  // Footer profile button
  document.getElementById('footer-profile-btn')?.addEventListener('click', () => {
    alert('Profile settings would be implemented here.\n\nThis would show user profile, account settings, security options, and personal information management.');
  });

  // Header brand/logo button
  document.getElementById('header-brand-btn')?.addEventListener('click', () => {
    switchView('overview');
  });

  // Apply Now button
  document.getElementById('apply-offer-btn')?.addEventListener('click', () => {
    const offer = dashboardState.marketing.offers[marketingOfferIndex];
    alert(`You selected: ${offer.title}\nAmount: ${currencyFormatter.format(offer.amount)}\nLet's proceed with your application!`);
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
      switchView(view);
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

function handleNavigation(event) {
  const viewName = event.currentTarget?.dataset.view;
  if (!viewName) return;

  event.preventDefault();
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
function handleRefreshDashboard() {
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
  
  // Reinitialize dashboard data
  initializeDashboard();
  
  // Manually refresh marketing content
  advanceMarketingOffer();
  advanceMarketingTicker();
  animateLiveStats();
  syncDashboardToSharedState();
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
  // For now, show a simple search alert
  // In a full implementation, this would show/hide a search input
  const searchTerm = prompt('Search loans, transactions, or insights:');
  if (searchTerm && searchTerm.trim()) {
    alert(`Searching for: "${searchTerm.trim()}"\n\nSearch functionality would be implemented here to find loans, transactions, or insights matching your query.`);
  }
}

// Mark All Notifications Read
function markAllNotificationsRead() {
  dashboardState.notifications.forEach(n => n.unread = false);
  populateNotifications();
  syncDashboardToSharedState();
  
  // Update badge
  const badge = document.querySelector('.notification-badge');
  if (badge) badge.style.display = 'none';
}

// Handle Payment Type Change
function handlePaymentTypeChange(e) {
  const partialGroup = document.getElementById('partial-amount-group');
  if (e.target.value === 'partial') {
    partialGroup.style.display = 'flex';
  } else {
    partialGroup.style.display = 'none';
  }
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
  document.getElementById('payment-modal')?.classList.remove('open');
}

// Confirm Payment
function confirmPayment() {
  // Simulate payment processing
  const btn = document.getElementById('confirm-payment-btn');
  if (!btn) return;

  btn.textContent = 'Processing...';
  btn.disabled = true;
  
  setTimeout(() => {
    btn.textContent = 'Confirm Payment';
    btn.disabled = false;
    closePaymentModal();

    const firstOutstandingLoan = dashboardState.loans.find((loan) => loan.remaining > 0);
    if (firstOutstandingLoan) {
      const paymentAmount = Math.min(firstOutstandingLoan.remaining, 420000);
      firstOutstandingLoan.remaining = Math.max(0, firstOutstandingLoan.remaining - paymentAmount);
      firstOutstandingLoan.status = firstOutstandingLoan.remaining === 0 ? 'completed' : 'active';
      if (firstOutstandingLoan.status === 'completed') {
        firstOutstandingLoan.paidInstallments = firstOutstandingLoan.term;
      }
      dashboardState.user.remainingBalance = dashboardState.loans.reduce((sum, loan) => sum + loan.remaining, 0);
    }
    
    // Show success notification
    addNotification({
      type: 'success',
      title: 'Payment Successful',
      text: 'Your payment has been processed successfully.',
      time: 'Just now',
      unread: true
    });
  }, 2000);
}

// Copy Referral Code
function copyReferralCode() {
  const code = document.getElementById('referral-code')?.textContent;
  const btn = document.getElementById('copy-referral-code');
  if (!code || !btn || !navigator.clipboard) return;

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
function setupAutoDebit() {
  const agree = document.getElementById('autodebit-agree');
  if (!agree) return;

  if (!agree.checked) {
    alert('Please agree to automatic deductions first.');
    return;
  }
  
  alert('Auto-debit has been set up successfully! You will receive 5% discount on your interest.');
}

// Handle Early Repayment
function handleEarlyRepayment() {
  const confirmAmount = document.getElementById('confirm-amount');
  const paymentModal = document.getElementById('payment-modal');
  if (!confirmAmount || !paymentModal) return;

  confirmAmount.textContent = 'UGX 1,155,000';
  paymentModal.classList.add('open');
}

// Handle Quick Action
function handleQuickAction(e) {
  const action = e.currentTarget.dataset.action;
  
  switch (action) {
    case 'apply':
      alert('Redirecting to loan application...');
      break;
    case 'repay':
      switchView('repay');
      break;
    case 'topup':
      alert('Top-up feature coming soon!');
      break;
    case 'early':
      switchView('repay');
      break;
  }
}

function handleQuickBoxClick(e) {
  const quickBox = e.currentTarget.dataset.quickBox;

  switch (quickBox) {
    case 'active':
      switchToLoansView('active');
      break;
    case 'overdue':
      switchToLoansView('overdue');
      break;
    case 'repay':
      switchView('repay');
      break;
  }
}

// Handle Loan Item Click
function handleLoanItemClick(e) {
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
