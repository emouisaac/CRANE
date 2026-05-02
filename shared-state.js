(() => {
  const STORAGE_KEY = 'crane-shared-state-v1';

  function createDefaultState() {
    const now = Date.now();

    return {
      user: {
        name: 'John Doe',
        initials: 'JD',
        creditScore: 742,
        loyaltyTier: 'Gold',
        totalBorrowed: 2500000,
        remainingBalance: 1300000,
        nextDueDate: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString()
      },
      loans: [
        {
          id: 'L2024001',
          borrowerName: 'John Doe',
          amount: 1200000,
          remaining: 850000,
          interest: 1.5,
          status: 'active',
          dueDate: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
          term: 6,
          paidInstallments: 3
        },
        {
          id: 'L2024002',
          borrowerName: 'John Doe',
          amount: 650000,
          remaining: 450000,
          interest: 1.8,
          status: 'overdue',
          dueDate: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
          term: 4,
          paidInstallments: 1
        },
        {
          id: 'L2023045',
          borrowerName: 'John Doe',
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
      },
      admin: {
        applications: [
          { id: 'APP-24051', user: 'John Doe', amount: 1200000, status: 'review', score: 742, requestedAt: '10 min ago' },
          { id: 'APP-24052', user: 'Jane Smith', amount: 840000, status: 'review', score: 684, requestedAt: '32 min ago' },
          { id: 'APP-24053', user: 'Sarah K.', amount: 1600000, status: 'approved', score: 755, requestedAt: '1 hr ago' }
        ],
        riskAlerts: [
          { id: 'RISK-1', severity: 'high', title: 'Device clustering', text: 'Two active loans now share one device fingerprint.', time: '2 hours ago' },
          { id: 'RISK-2', severity: 'medium', title: 'Late pattern', text: 'One borrower has shifted from on-time to repeated late repayment.', time: '5 hours ago' },
          { id: 'RISK-3', severity: 'medium', title: 'Referral spike', text: 'Referral activity rose sharply from a single source this morning.', time: 'Today' }
        ],
        auditLogs: [
          { id: 'AUD-1', time: '10:45 AM', actor: 'Admin User', action: 'Approved loan L2024001', details: 'Promoted queue loan to active book.' },
          { id: 'AUD-2', time: '10:30 AM', actor: 'System', action: 'Flagged L2024002 overdue', details: 'Due date passed with remaining balance outstanding.' },
          { id: 'AUD-3', time: '10:10 AM', actor: 'Admin User', action: 'Synced referral ledger', details: 'Referral payouts and balances refreshed.' }
        ]
      }
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeLoan(loan, fallbackBorrowerName) {
    return {
      id: loan.id || `L-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      borrowerName: loan.borrowerName || fallbackBorrowerName || 'Borrower',
      amount: Number(loan.amount) || 0,
      remaining: Math.max(0, Number(loan.remaining) || 0),
      interest: Number(loan.interest) || 0,
      status: ['active', 'overdue', 'completed'].includes(loan.status) ? loan.status : 'active',
      dueDate: loan.dueDate || null,
      term: Number(loan.term) || 1,
      paidInstallments: Number(loan.paidInstallments) || 0
    };
  }

  function normalizeState(rawState) {
    const defaults = createDefaultState();
    const incoming = rawState && typeof rawState === 'object' ? rawState : {};
    const user = { ...defaults.user, ...(incoming.user || {}) };
    const marketing = {
      ...defaults.marketing,
      ...(incoming.marketing || {}),
      pulse: { ...defaults.marketing.pulse, ...((incoming.marketing && incoming.marketing.pulse) || {}) }
    };

    const loansSource = Array.isArray(incoming.loans) && incoming.loans.length ? incoming.loans : defaults.loans;
    const loans = loansSource.map((loan) => normalizeLoan(loan, user.name));

    const remainingBalance = loans.reduce((sum, loan) => sum + loan.remaining, 0);
    const activeDueDates = loans
      .filter((loan) => loan.status !== 'completed' && loan.dueDate)
      .map((loan) => new Date(loan.dueDate).getTime())
      .filter((time) => !Number.isNaN(time))
      .sort((a, b) => a - b);

    return {
      user: {
        ...user,
        remainingBalance,
        nextDueDate: activeDueDates.length
          ? new Date(activeDueDates[0]).toISOString()
          : defaults.user.nextDueDate
      },
      loans,
      notifications: Array.isArray(incoming.notifications) && incoming.notifications.length
        ? clone(incoming.notifications)
        : defaults.notifications,
      referrals: Array.isArray(incoming.referrals) && incoming.referrals.length
        ? clone(incoming.referrals)
        : defaults.referrals,
      marketing,
      admin: {
        applications: Array.isArray(incoming.admin?.applications) && incoming.admin.applications.length
          ? clone(incoming.admin.applications)
          : defaults.admin.applications,
        riskAlerts: Array.isArray(incoming.admin?.riskAlerts) && incoming.admin.riskAlerts.length
          ? clone(incoming.admin.riskAlerts)
          : defaults.admin.riskAlerts,
        auditLogs: Array.isArray(incoming.admin?.auditLogs) && incoming.admin.auditLogs.length
          ? clone(incoming.admin.auditLogs)
          : defaults.admin.auditLogs
      }
    };
  }

  function read() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const defaults = normalizeState(createDefaultState());
        write(defaults);
        return defaults;
      }

      return normalizeState(JSON.parse(raw));
    } catch (error) {
      return normalizeState(createDefaultState());
    }
  }

  function write(state) {
    const normalized = normalizeState(state);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function update(updater) {
    const current = read();
    const next = typeof updater === 'function' ? updater(clone(current)) : current;
    return write(next);
  }

  window.CraneSharedState = {
    STORAGE_KEY,
    createDefaultState,
    normalizeState,
    read,
    write,
    update
  };
})();
