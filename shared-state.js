(() => {
  const STORAGE_KEY = "crane-shared-state-v1";
  const STORE_EVENT = "crane-shared-state:change";
  const STORE_ENDPOINT = "/api/shared-state";
  const AUTO_REFRESH_INTERVAL_MS = 15000;

  let cachedState = null;
  let hasHydrated = false;
  let hydratePromise = null;
  let saveQueue = Promise.resolve();
  let autoRefreshHandle = null;
  const subscribers = new Set();

  function createDefaultState() {
    const now = Date.now();

    return {
      user: {
        name: "John Doe",
        initials: "JD",
        creditScore: 742,
        loyaltyTier: "Gold",
        totalBorrowed: 2500000,
        remainingBalance: 1300000,
        nextDueDate: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString()
      },
      loans: [
        {
          id: "L2024001",
          borrowerName: "John Doe",
          amount: 1200000,
          remaining: 850000,
          interest: 1.5,
          status: "active",
          dueDate: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
          term: 6,
          paidInstallments: 3
        },
        {
          id: "L2024002",
          borrowerName: "John Doe",
          amount: 650000,
          remaining: 450000,
          interest: 1.8,
          status: "overdue",
          dueDate: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
          term: 4,
          paidInstallments: 1
        },
        {
          id: "L2023045",
          borrowerName: "John Doe",
          amount: 500000,
          remaining: 0,
          interest: 1.5,
          status: "completed",
          dueDate: null,
          term: 3,
          paidInstallments: 3
        }
      ],
      notifications: [
        { id: 1, type: "success", title: "Limit Unlocked", text: "Your clean repayment record is opening bigger offers.", time: "Live", unread: true },
        { id: 2, type: "warning", title: "Rate Window", text: "Pay early to keep your best rate active.", time: "Today", unread: true },
        { id: 3, type: "info", title: "Hot Trend", text: "Short-term business loans are moving fastest this week.", time: "Trend", unread: false },
        { id: 4, type: "success", title: "Fast Cash", text: "Verified repeat borrowers are getting cash in under 15 minutes.", time: "Now", unread: false }
      ],
      referrals: [
        { name: "Sarah K.", date: "Apr 15, 2024", level: 1, earned: 50000, status: "paid" },
        { name: "Mike R.", date: "Apr 10, 2024", level: 1, earned: 50000, status: "paid" },
        { name: "Jane D.", date: "Apr 5, 2024", level: 2, earned: 25000, status: "pending" }
      ],
      marketing: {
        offers: [
          {
            title: "Growth Boost",
            amount: 5000000,
            rate: "1.2% monthly",
            term: "12 months",
            installment: 480000,
            payout: "14 minutes",
            message: "Use it while your best rate is still live.",
            blurb: "Great for stock, school fees, or urgent cashflow.",
            progress: 72
          },
          {
            title: "Fast Flex",
            amount: 3200000,
            rate: "1.5% monthly",
            term: "6 months",
            installment: 565000,
            payout: "11 minutes",
            message: "Bridge the gap and keep moving today.",
            blurb: "Ideal for short-term needs and emergency expenses.",
            progress: 81
          },
          {
            title: "Premium Lift",
            amount: 7800000,
            rate: "1.1% monthly",
            term: "18 months",
            installment: 505000,
            payout: "18 minutes",
            message: "Borrow bigger with more breathing room.",
            blurb: "Built for expansion, equipment, and bigger goals.",
            progress: 88
          }
        ],
        tickerMessages: [
          "Clean repayment streaks are unlocking bigger limits right now.",
          "Early repayments are helping more users save on interest.",
          "Repeat borrowers are getting quicker approvals this hour."
        ],
        pulse: {
          approvedToday: 128,
          averageTicket: "UGX 1.8M",
          sameDay: "94%",
          rating: "4.9/5",
          approvalRate: "92%",
          payoutSpeed: "14 min",
          repeatBorrowers: "68%"
        }
      },
      admin: {
        adminUsers: [
          { id: "ADM-001", name: "Sarah Johnson", email: "sarah.johnson@crane.com", role: "super_admin", status: "active", createdAt: "2024-01-15", lastLogin: "2 hours ago" },
          { id: "ADM-002", name: "Michael Chen", email: "michael.chen@crane.com", role: "loan_officer", status: "active", createdAt: "2024-02-01", lastLogin: "1 day ago" },
          { id: "ADM-003", name: "Emma Wilson", email: "emma.wilson@crane.com", role: "risk_analyst", status: "inactive", createdAt: "2024-03-10", lastLogin: "5 days ago" }
        ],
        loanApplications: [
          { id: "APP-24051", borrower: "John Doe", phone: "+256701234567", amount: 1200000, term: 6, purpose: "Business inventory", status: "pending", score: 742, requestedAt: "2024-05-02T09:30:00Z", documents: ["id_doc", "income_proof", "selfie"] },
          { id: "APP-24052", borrower: "Jane Smith", phone: "+256702345678", amount: 840000, term: 4, purpose: "School fees", status: "pending", score: 684, requestedAt: "2024-05-02T08:45:00Z", documents: ["id_doc", "selfie"] },
          { id: "APP-24053", borrower: "Sarah K.", phone: "+256703456789", amount: 1600000, term: 12, purpose: "Store expansion", status: "approved", score: 755, requestedAt: "2024-05-02T08:00:00Z", documents: ["id_doc", "income_proof", "selfie", "bank_statement"] },
          { id: "APP-24054", borrower: "Robert Mwale", phone: "+256704567890", amount: 500000, term: 3, purpose: "Emergency expenses", status: "rejected", score: 612, requestedAt: "2024-05-01T15:20:00Z", rejectReason: "Low credit score", documents: ["id_doc"] }
        ],
        riskAlerts: [
          { id: "RISK-1", severity: "high", title: "Device clustering", text: "Two active loans now share one device fingerprint.", time: "2 hours ago", status: "open" },
          { id: "RISK-2", severity: "medium", title: "Late pattern", text: "One borrower has shifted from on-time to repeated late repayment.", time: "5 hours ago", status: "investigating" },
          { id: "RISK-3", severity: "medium", title: "Referral spike", text: "Referral activity rose sharply from a single source this morning.", time: "Today", status: "open" },
          { id: "RISK-4", severity: "high", title: "Fraud flag", text: "Multiple loan applications from same location within minutes.", time: "1 hour ago", status: "open" }
        ],
        auditLogs: [
          { id: "AUD-1", time: "10:45 AM", actor: "Sarah Johnson", action: "Approved loan APP-24053", details: "Promoted queue loan to active book." },
          { id: "AUD-2", time: "10:30 AM", actor: "System", action: "Flagged L2024002 overdue", details: "Due date passed with remaining balance outstanding." },
          { id: "AUD-3", time: "10:10 AM", actor: "Michael Chen", action: "Synced referral ledger", details: "Referral payouts and balances refreshed." },
          { id: "AUD-4", time: "09:55 AM", actor: "System", action: "Created admin user", details: "New loan officer account: emma.wilson@crane.com" },
          { id: "AUD-5", time: "09:20 AM", actor: "Sarah Johnson", action: "Updated system settings", details: "Changed default interest rate from 1.5% to 1.4%" }
        ],
        settings: {
          defaultInterestRate: 1.5,
          maxLoanAmount: 10000000,
          minLoanAmount: 100000,
          autoApprovalThreshold: 750,
          maxConcurrentLoans: 5,
          paymentGracePeriod: 3
        }
      },
      metadata: {
        knownPhones: []
      }
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeLoan(loan, fallbackBorrowerName) {
    return {
      id: loan.id || `L-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      borrowerName: loan.borrowerName || fallbackBorrowerName || "Borrower",
      amount: Number(loan.amount) || 0,
      remaining: Math.max(0, Number(loan.remaining) || 0),
      interest: Number(loan.interest) || 0,
      status: ["active", "overdue", "completed"].includes(loan.status) ? loan.status : "active",
      dueDate: loan.dueDate || null,
      term: Number(loan.term) || 1,
      paidInstallments: Number(loan.paidInstallments) || 0
    };
  }

  function normalizeApplication(application) {
    const borrower = application.borrower || application.user || "Borrower";
    const documents = Array.isArray(application.documents) ? clone(application.documents) : [];

    return {
      id: application.id || `APP-${Date.now()}`,
      borrower,
      user: borrower,
      phone: application.phone || "",
      amount: Number(application.amount) || 0,
      term: Number(application.term) || 1,
      purpose: application.purpose || "General use",
      status: application.status || "pending",
      score: Number(application.score) || 0,
      requestedAt: application.requestedAt || new Date().toISOString(),
      documents,
      rejectReason: application.rejectReason || null
    };
  }

  function normalizeAdminUser(adminUser) {
    return {
      id: adminUser.id || `ADM-${Date.now()}`,
      name: adminUser.name || "Admin User",
      email: adminUser.email || "",
      role: adminUser.role || "loan_officer",
      status: adminUser.status || "active",
      createdAt: adminUser.createdAt || new Date().toISOString().slice(0, 10),
      lastLogin: adminUser.lastLogin || "Never"
    };
  }

  function normalizeState(rawState) {
    const defaults = createDefaultState();
    const incoming = rawState && typeof rawState === "object" ? rawState : {};
    const incomingAdmin = incoming.admin && typeof incoming.admin === "object" ? incoming.admin : {};
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
      .filter((loan) => loan.status !== "completed" && loan.dueDate)
      .map((loan) => new Date(loan.dueDate).getTime())
      .filter((time) => !Number.isNaN(time))
      .sort((a, b) => a - b);

    const applicationsSource = Array.isArray(incomingAdmin.loanApplications) && incomingAdmin.loanApplications.length
      ? incomingAdmin.loanApplications
      : Array.isArray(incomingAdmin.applications) && incomingAdmin.applications.length
        ? incomingAdmin.applications
        : defaults.admin.loanApplications;
    const applications = applicationsSource.map(normalizeApplication);

    const adminUsers = Array.isArray(incomingAdmin.adminUsers) && incomingAdmin.adminUsers.length
      ? incomingAdmin.adminUsers.map(normalizeAdminUser)
      : defaults.admin.adminUsers.map(normalizeAdminUser);

    const riskAlerts = Array.isArray(incomingAdmin.riskAlerts) && incomingAdmin.riskAlerts.length
      ? clone(incomingAdmin.riskAlerts)
      : clone(defaults.admin.riskAlerts);

    const auditLogs = Array.isArray(incomingAdmin.auditLogs) && incomingAdmin.auditLogs.length
      ? clone(incomingAdmin.auditLogs)
      : clone(defaults.admin.auditLogs);

    const settings = {
      ...defaults.admin.settings,
      ...(incomingAdmin.settings || {})
    };

    const knownPhones = Array.isArray(incoming.metadata?.knownPhones) && incoming.metadata.knownPhones.length
      ? Array.from(new Set(incoming.metadata.knownPhones.map((phone) => String(phone).trim()).filter(Boolean)))
      : clone(defaults.metadata.knownPhones);

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
        : clone(defaults.notifications),
      referrals: Array.isArray(incoming.referrals) && incoming.referrals.length
        ? clone(incoming.referrals)
        : clone(defaults.referrals),
      marketing,
      admin: {
        adminUsers,
        loanApplications: applications,
        applications,
        riskAlerts,
        auditLogs,
        settings
      },
      metadata: {
        knownPhones
      }
    };
  }

  function emitChange() {
    const snapshot = read();

    subscribers.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("Shared state subscriber error:", error);
      }
    });

    window.dispatchEvent(new CustomEvent(STORE_EVENT, { detail: snapshot }));
  }

  async function requestSharedState(url, options = {}) {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.headers || {})
      },
      ...options
    });

    if (!response.ok) {
      throw new Error(`Shared state request failed with status ${response.status}.`);
    }

    return response.json();
  }

  function read() {
    if (!cachedState) {
      cachedState = normalizeState(createDefaultState());
    }

    return clone(cachedState);
  }

  async function hydrate(force = false) {
    if (!force && hasHydrated) {
      return read();
    }

    if (hydratePromise) {
      return hydratePromise;
    }

    hydratePromise = (async () => {
      try {
        const payload = await requestSharedState(STORE_ENDPOINT);
        cachedState = normalizeState(payload.data || {});
        hasHydrated = true;
        emitChange();
      } catch (error) {
        console.warn("Falling back to in-browser defaults for shared state.", error);
        if (!cachedState) {
          cachedState = normalizeState(createDefaultState());
          emitChange();
        }
      }

      return read();
    })();

    try {
      return await hydratePromise;
    } finally {
      hydratePromise = null;
    }
  }

  async function write(state) {
    const normalized = normalizeState(state);
    const previousState = cachedState ? clone(cachedState) : normalizeState(createDefaultState());

    cachedState = normalized;
    emitChange();

    try {
      const payload = await requestSharedState(STORE_ENDPOINT, {
        method: "PUT",
        body: JSON.stringify({ state: normalized })
      });

      cachedState = normalizeState(payload.data || normalized);
      hasHydrated = true;
      emitChange();
      return read();
    } catch (error) {
      cachedState = previousState;
      emitChange();
      console.error("Failed to persist shared state.", error);
      throw error;
    }
  }

  async function update(updater) {
    saveQueue = saveQueue
      .catch(() => undefined)
      .then(async () => {
        const current = await hydrate();
        const next = typeof updater === "function" ? updater(clone(current)) : updater;
        return write(next || current);
      });

    return saveQueue;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") {
      return () => undefined;
    }

    subscribers.add(listener);
    return () => {
      subscribers.delete(listener);
    };
  }

  function getKnownPhones() {
    return Array.from(new Set(read().metadata?.knownPhones || []));
  }

  async function rememberPhone(phone) {
    const normalizedPhone = String(phone || "").trim();
    if (!normalizedPhone) {
      return read();
    }

    return update((state) => {
      const existingPhones = new Set(state.metadata?.knownPhones || []);
      existingPhones.add(normalizedPhone);
      state.metadata = {
        ...(state.metadata || {}),
        knownPhones: Array.from(existingPhones)
      };
      return state;
    });
  }

  function startAutoSync() {
    if (autoRefreshHandle) {
      return;
    }

    const refresh = () => {
      hydrate(true).catch(() => undefined);
    };

    autoRefreshHandle = window.setInterval(refresh, AUTO_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        refresh();
      }
    });
  }

  cachedState = normalizeState(createDefaultState());
  startAutoSync();
  hydrate().catch(() => undefined);

  window.CraneSharedState = {
    STORAGE_KEY,
    STORE_EVENT,
    createDefaultState,
    normalizeState,
    read,
    hydrate,
    write,
    update,
    subscribe,
    getKnownPhones,
    rememberPhone,
    startAutoSync
  };
})();
