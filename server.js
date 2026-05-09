const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");
const { DatabaseSync } = require("node:sqlite");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const DB_PATH = path.join(DATA_DIR, "crane.sqlite");
const SESSION_COOKIE = "crane_session";
const PORT = Number(process.env.PORT || 3000);
const MAX_JSON_BYTES = 45 * 1024 * 1024;

loadEnvFile(path.join(ROOT, ".env"));

const env = {
  port: Number(process.env.PORT || PORT),
  sessionDays: Number(process.env.REFRESH_EXPIRY_DAYS || 30),
  masterAdminUsername: process.env.MASTER_ADMIN_USERNAME || "master_admin",
  masterAdminPassword: process.env.MASTER_ADMIN_PASSWORD || "CraneMaster@2026",
  corsOrigins: parseCsv(process.env.CORS_ORIGINS || ""),
};

ensureDirectory(DATA_DIR);
ensureDirectory(UPLOAD_DIR);

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");

initializeSchema();
seedSettings();

const sseClients = new Set();

const server = http.createServer(async (req, res) => {
  try {
    applyCorsHeaders(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith("/api/")) {
      await handleApiRequest(req, res, url, pathname);
      return;
    }

    await serveStatic(pathname, res);
  } catch (error) {
    console.error(error);
    if (res.headersSent) {
      res.end();
      return;
    }
    sendJson(res, error.status || 500, { error: error.message || "Internal server error." });
  }
});

server.listen(env.port, () => {
  console.log(`Crane Credit server listening on http://127.0.0.1:${env.port}`);
});

function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS borrowers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      email TEXT,
      country TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      referral_code TEXT NOT NULL UNIQUE,
      account_status TEXT NOT NULL DEFAULT 'active',
      member_since TEXT NOT NULL,
      last_login_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      email TEXT,
      phone TEXT,
      pin_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      permissions_json TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      actor_role TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS loan_applications (
      id TEXT PRIMARY KEY,
      borrower_id INTEGER NOT NULL,
      amount_requested INTEGER NOT NULL,
      term_months INTEGER NOT NULL,
      purpose TEXT NOT NULL,
      applicant_json TEXT NOT NULL,
      employment_json TEXT NOT NULL,
      status TEXT NOT NULL,
      admin_stage TEXT NOT NULL,
      admin_note TEXT,
      super_admin_note TEXT,
      recommended_amount INTEGER,
      recommended_rate REAL,
      recommended_installment INTEGER,
      payout_eta TEXT,
      admin_id INTEGER,
      super_admin_id TEXT,
      submitted_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      approved_at TEXT,
      rejected_at TEXT,
      FOREIGN KEY (borrower_id) REFERENCES borrowers(id)
    );

    CREATE TABLE IF NOT EXISTS loan_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_application_id TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      label TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      FOREIGN KEY (loan_application_id) REFERENCES loan_applications(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS loans (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL UNIQUE,
      borrower_id INTEGER NOT NULL,
      principal_amount INTEGER NOT NULL,
      interest_rate REAL NOT NULL,
      total_repayable INTEGER NOT NULL,
      outstanding_amount INTEGER NOT NULL,
      installment_amount INTEGER NOT NULL,
      term_months INTEGER NOT NULL,
      paid_amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      start_date TEXT NOT NULL,
      next_due_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (application_id) REFERENCES loan_applications(id),
      FOREIGN KEY (borrower_id) REFERENCES borrowers(id)
    );

    CREATE TABLE IF NOT EXISTS repayments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id TEXT NOT NULL,
      borrower_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      payment_type TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (loan_id) REFERENCES loans(id),
      FOREIGN KEY (borrower_id) REFERENCES borrowers(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_role TEXT NOT NULL,
      recipient_id TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      level TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS support_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      borrower_id INTEGER NOT NULL,
      sender_role TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (borrower_id) REFERENCES borrowers(id)
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      borrower_id INTEGER NOT NULL,
      referred_name TEXT NOT NULL,
      level TEXT NOT NULL,
      earned_amount INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (borrower_id) REFERENCES borrowers(id)
    );

    CREATE TABLE IF NOT EXISTS score_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      borrower_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      grade TEXT NOT NULL,
      factors_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (borrower_id) REFERENCES borrowers(id)
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_role TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function seedSettings() {
  const now = nowIso();

  const publicContent = {
    ticker: [
      "Clean repayment streaks are unlocking bigger limits right now.",
      "Early repayments are helping more users save on interest.",
      "Repeat borrowers are getting quicker approvals this hour."
    ],
    offer: {
      title: "Growth Boost",
      amount: 5000000,
      rate: 1.2,
      installment: 480000,
      payout: "14 min",
      message: "Use it while your best rate is still live."
    },
    contact: {
      phone: "+256 788 408 032",
      whatsapp: "+256 788 408 032",
      email: "support@craneloans.com"
    }
  };

  const creditPolicy = {
    baseMonthlyRate: 1.8,
    serviceFee: 2500,
    earlyRepayDiscountRate: 0.035
  };

  const upsert = db.prepare(`
    INSERT INTO settings (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO NOTHING
  `);

  upsert.run("public_content", JSON.stringify(publicContent), now);
  upsert.run("credit_policy", JSON.stringify(creditPolicy), now);
}

async function handleApiRequest(req, res, url, pathname) {
  if (pathname === "/api/health" && req.method === "GET") {
    sendJson(res, 200, { ok: true, now: nowIso() });
    return;
  }

  if (pathname === "/api/events" && req.method === "GET") {
    const session = getSessionFromRequest(req);
    openEventStream(req, res, session);
    return;
  }

  if (pathname === "/api/public/bootstrap" && req.method === "GET") {
    const session = getSessionFromRequest(req);
    const payload = buildPublicBootstrap(session);
    sendJson(res, 200, payload);
    return;
  }

  if (pathname === "/api/profile" && req.method === "GET") {
    const session = requireSession(req, "borrower");
    const borrower = getBorrowerById(Number(session.actorId));
    if (!borrower) {
      throw createHttpError(404, "Borrower profile not found.");
    }
    sendJson(res, 200, {
      ok: true,
      profile: buildBorrowerViewModel(borrower).profile
    });
    return;
  }

  if (pathname === "/api/shared-state" && req.method === "GET") {
    const session = getSessionFromRequest(req);
    sendJson(res, 200, buildLegacySharedState(session));
    return;
  }

  if (pathname === "/api/auth/register" && req.method === "POST") {
    const body = await readJson(req);
    const borrower = registerBorrower(body);
    const session = createSession("borrower", String(borrower.id), borrower.full_name);
    setSessionCookie(req, res, session.token);
    broadcastPublicRefresh();
    sendJson(res, 201, { ok: true, borrower: sanitizeBorrower(borrower) });
    return;
  }

  if (pathname === "/api/auth/login" && req.method === "POST") {
    const body = await readJson(req);
    const borrower = loginBorrower(body);
    const session = createSession("borrower", String(borrower.id), borrower.full_name);
    setSessionCookie(req, res, session.token);
    sendJson(res, 200, { ok: true, borrower: sanitizeBorrower(borrower) });
    return;
  }

  if (pathname === "/api/auth/logout" && req.method === "POST") {
    clearCurrentSession(req, res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/borrower/loan-applications" && req.method === "POST") {
    const session = requireSession(req, "borrower");
    const body = await readJson(req);
    const application = await createLoanApplication(Number(session.actorId), body);
    logActivity("borrower", session.actorId, session.actorName, "submitted loan application", "loan_application", application.id, {
      amountRequested: application.amount_requested
    });
    createNotification("borrower", session.actorId, "Loan request submitted", `Your application ${application.id} is waiting for review.`, "info");
    createNotification("admin", null, "New loan application", `${session.actorName} submitted ${application.id} for review.`, "info");
    broadcastRoleRefresh(["borrower", "admin", "super_admin"]);
    sendJson(res, 201, { ok: true, applicationId: application.id });
    return;
  }

  if (pathname === "/api/borrower/repayments" && req.method === "POST") {
    const session = requireSession(req, "borrower");
    const body = await readJson(req);
    const repayment = makeRepayment(Number(session.actorId), body);
    logActivity("borrower", session.actorId, session.actorName, "made repayment", "loan", repayment.loan_id, {
      amount: repayment.amount
    });
    createNotification("borrower", session.actorId, "Repayment received", `We recorded a payment of ${formatCurrency(repayment.amount)}.`, "success");
    createNotification("admin", null, "Repayment posted", `${session.actorName} made a repayment of ${formatCurrency(repayment.amount)}.`, "success");
    broadcastRoleRefresh(["borrower", "admin", "super_admin"]);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/borrower/autodebit" && req.method === "POST") {
    const session = requireSession(req, "borrower");
    const body = await readJson(req);
    const setting = getSetting("credit_policy");
    createNotification("borrower", session.actorId, "Auto-debit saved", `Your preference was saved for ${body.debitDay || "the selected day"}.`, "success");
    logActivity("borrower", session.actorId, session.actorName, "updated auto debit", "setting", "credit_policy", setting);
    broadcastRoleRefresh(["borrower", "admin"]);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/borrower/notifications/read" && req.method === "POST") {
    const session = requireSession(req, "borrower");
    db.prepare(`
      UPDATE notifications
      SET is_read = 1
      WHERE recipient_role = 'borrower'
        AND (recipient_id IS NULL OR recipient_id = ?)
    `).run(String(session.actorId));
    broadcastRoleRefresh(["borrower"]);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/support/messages" && req.method === "GET") {
    const session = requireSession(req, "borrower");
    sendJson(res, 200, { messages: getSupportMessages(Number(session.actorId)) });
    return;
  }

  if (pathname === "/api/support/messages" && req.method === "POST") {
    const session = requireSession(req, "borrower");
    const body = await readJson(req);
    addSupportMessage(Number(session.actorId), "borrower", String(session.actorId), body.message);
    createNotification("admin", null, "Support message", `${session.actorName} sent a new support message.`, "info");
    broadcastRoleRefresh(["borrower", "admin", "super_admin"]);
    sendJson(res, 201, { ok: true });
    return;
  }

  if (pathname === "/api/admin/login" && req.method === "POST") {
    const body = await readJson(req);
    const admin = loginAdmin(body);
    const session = createSession("admin", String(admin.id), admin.full_name);
    setSessionCookie(req, res, session.token);
    sendJson(res, 200, { ok: true, admin: sanitizeAdmin(admin) });
    return;
  }

  if (pathname === "/api/admin/me" && req.method === "GET") {
    const session = requireSession(req, "admin");
    sendJson(res, 200, { admin: { id: session.actorId, fullName: session.actorName } });
    return;
  }

  if (pathname === "/api/admin/logout" && req.method === "POST") {
    clearCurrentSession(req, res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/admin/dashboard" && req.method === "GET") {
    const session = requireSession(req, "admin");
    sendJson(res, 200, buildAdminDashboard(session));
    return;
  }

  if (pathname === "/api/admin/support/reply" && req.method === "POST") {
    const session = requireSession(req, "admin");
    const body = await readJson(req);
    addSupportMessage(Number(body.borrowerId), "admin", String(session.actorId), body.message);
    createNotification("borrower", String(body.borrowerId), "Support replied", `${session.actorName} replied to your support conversation.`, "info");
    logActivity("admin", session.actorId, session.actorName, "replied to support", "borrower", String(body.borrowerId), {});
    broadcastRoleRefresh(["borrower", "admin"]);
    sendJson(res, 201, { ok: true });
    return;
  }

  if (pathname.startsWith("/api/admin/applications/") && pathname.endsWith("/review") && req.method === "POST") {
    const session = requireSession(req, "admin");
    const applicationId = pathname.split("/")[4];
    const body = await readJson(req);
    reviewApplicationByAdmin(session, applicationId, body);
    broadcastRoleRefresh(["borrower", "admin", "super_admin"]);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname.startsWith("/api/admin/borrowers/") && pathname.endsWith("/pin") && req.method === "PATCH") {
    const session = requireSession(req, "admin");
    const borrowerId = pathname.split("/")[4];
    const body = await readJson(req);
    updateBorrowerPinByAdmin(session, borrowerId, body);
    broadcastRoleRefresh(["borrower"]);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/super-admin/login" && req.method === "POST") {
    const body = await readJson(req);
    assertSuperAdminCredentials(body);
    const session = createSession("super_admin", "env-super-admin", "Super Admin");
    setSessionCookie(req, res, session.token);
    sendJson(res, 200, { ok: true, superAdmin: { username: env.masterAdminUsername } });
    return;
  }

  if (pathname === "/api/super-admin/me" && req.method === "GET") {
    const session = requireSession(req, "super_admin");
    sendJson(res, 200, { superAdmin: { id: session.actorId, fullName: session.actorName } });
    return;
  }

  if (pathname === "/api/super-admin/logout" && req.method === "POST") {
    clearCurrentSession(req, res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/super-admin/dashboard" && req.method === "GET") {
    const session = requireSession(req, "super_admin");
    sendJson(res, 200, buildSuperAdminDashboard(session));
    return;
  }

  if (pathname === "/api/super-admin/admins" && req.method === "POST") {
    const session = requireSession(req, "super_admin");
    const body = await readJson(req);
    const admin = createAdmin(session, body);
    broadcastRoleRefresh(["admin", "super_admin"]);
    sendJson(res, 201, { ok: true, admin: sanitizeAdmin(admin) });
    return;
  }

  if (pathname.startsWith("/api/super-admin/admins/") && pathname.endsWith("/pin") && req.method === "PATCH") {
    const session = requireSession(req, "super_admin");
    const adminId = pathname.split("/")[4];
    const body = await readJson(req);
    updateAdminPinBySuperAdmin(session, adminId, body);
    broadcastRoleRefresh(["admin"]);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname.startsWith("/api/super-admin/admins/") && req.method === "PATCH") {
    const session = requireSession(req, "super_admin");
    const adminId = pathname.split("/")[4];
    const body = await readJson(req);
    updateAdminStatus(session, adminId, body);
    broadcastRoleRefresh(["admin", "super_admin"]);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname.startsWith("/api/super-admin/admins/") && req.method === "DELETE") {
    const session = requireSession(req, "super_admin");
    const adminId = pathname.split("/")[4];
    deleteAdmin(session, adminId);
    broadcastRoleRefresh(["admin", "super_admin"]);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname.startsWith("/api/super-admin/applications/") && pathname.endsWith("/decision") && req.method === "POST") {
    const session = requireSession(req, "super_admin");
    const applicationId = pathname.split("/")[4];
    const body = await readJson(req);
    decideApplicationBySuperAdmin(session, applicationId, body);
    broadcastRoleRefresh(["borrower", "admin", "super_admin"]);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/super-admin/public-content" && req.method === "PATCH") {
    requireSession(req, "super_admin");
    const body = await readJson(req);
    updateSetting("public_content", body);
    createNotification("borrower", null, "Platform update", "A live update was published to the borrower dashboard.", "info");
    broadcastPublicRefresh();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/super-admin/announcements" && req.method === "POST") {
    const session = requireSession(req, "super_admin");
    const body = await readJson(req);
    const role = body.targetRole || "borrower";
    createNotification(role, null, body.title || "Platform notice", body.message || "A new update is available.", "info");
    logActivity("super_admin", session.actorId, session.actorName, "broadcast announcement", "notification", role, body);
    broadcastRoleRefresh(["borrower", "admin", "super_admin"]);
    sendJson(res, 201, { ok: true });
    return;
  }

  if (pathname.startsWith("/api/documents/") && req.method === "GET") {
    const documentId = pathname.split("/")[3];
    await serveDocument(req, res, documentId);
    return;
  }

  sendJson(res, 404, { error: "Route not found." });
}

function buildPublicBootstrap(session) {
  const publicContent = getSetting("public_content");
  const liveStats = computeLiveStats();
  const payload = {
    marketing: {
      ticker: publicContent.ticker,
      offer: publicContent.offer,
      contact: publicContent.contact,
      liveStats
    },
    auth: {
      loggedIn: false
    }
  };

  if (!session || session.actorRole !== "borrower") {
    return payload;
  }

  const borrower = getBorrowerById(Number(session.actorId));
  if (!borrower) {
    return payload;
  }

  payload.auth = {
    loggedIn: true,
    borrower: buildBorrowerViewModel(borrower)
  };

  return payload;
}

function buildLegacySharedState(session) {
  const bootstrap = buildPublicBootstrap(session);
  const borrower = bootstrap.auth?.borrower || null;
  const safeLoan = borrower?.loans?.[0] || null;

  return {
    ok: true,
    loggedIn: Boolean(bootstrap.auth?.loggedIn),
    marketing: bootstrap.marketing,
    profile: borrower?.profile || null,
    borrower: borrower,
    notifications: borrower?.notifications || [],
    supportMessages: borrower?.supportMessages || [],
    referrals: borrower?.referrals?.items || [],
    referralCode: borrower?.referrals?.code || null,
    referralLink: borrower?.referrals?.link || "",
    score: borrower?.score || {
      current: null,
      grade: "No score yet",
      drivers: [],
      history: []
    },
    loans: borrower?.loans || [],
    applications: borrower?.applications || [],
    activeLoan: safeLoan ? {
      ...safeLoan,
      nextDueDate: safeLoan.nextDueDate || null
    } : {
      id: null,
      nextDueDate: null,
      installmentAmount: 0,
      outstandingAmount: 0,
      status: "none"
    },
    snapshot: borrower?.snapshot || {
      title: "No live account activity yet",
      message: "Sign in to view current balances, due dates, and real account alerts.",
      badge: "Awaiting sign in",
      activeLoans: 0,
      outstandingBalance: 0,
      nextDue: null,
      unreadAlerts: 0
    }
  };
}

function buildBorrowerViewModel(borrower) {
  const loans = getBorrowerLoans(borrower.id);
  const applications = getBorrowerApplications(borrower.id);
  const notifications = getNotifications("borrower", String(borrower.id));
  const referrals = getBorrowerReferrals(borrower.id);
  const supportMessages = getSupportMessages(borrower.id);
  const score = ensureScoreSnapshot(borrower.id);
  const latestLoan = loans.find((loan) => loan.status === "active") || loans[0] || null;
  const latestApplication = applications[0] || null;
  const activeLoans = loans.filter((loan) => loan.status === "active");
  const outstandingBalance = activeLoans.reduce((sum, loan) => sum + loan.outstanding_amount, 0);

  return {
    profile: sanitizeBorrower(borrower),
    notifications,
    supportMessages,
    snapshot: {
      title: latestLoan ? `You have ${activeLoans.length} live loan${activeLoans.length === 1 ? "" : "s"}` : (latestApplication ? `Application ${latestApplication.id} is ${humanizeStatus(latestApplication.status)}` : "No live account activity yet"),
      message: latestLoan
        ? `Track upcoming due dates, repayments, and account alerts in one place.`
        : (latestApplication ? `Your latest request is moving through review. We will notify you after every decision point.` : `Sign in to view current balances, due dates, and real account alerts.`),
      badge: latestLoan ? "Live account" : (latestApplication ? humanizeStatus(latestApplication.status) : "Awaiting sign in"),
      activeLoans: activeLoans.length,
      outstandingBalance,
      nextDue: latestLoan ? latestLoan.next_due_date : null,
      unreadAlerts: notifications.filter((item) => !item.isRead).length
    },
    loans: loans.map(mapLoanForClient),
    applications: applications.map(mapApplicationForClient),
    payment: {
      serviceFee: getSetting("credit_policy").serviceFee
    },
    score,
    referrals: {
      code: borrower.referral_code,
      link: `https://crane-credit.local/apply?ref=${borrower.referral_code}`,
      items: referrals
    },
    offerMatch: buildOfferMatch(score, latestApplication),
    contact: getSetting("public_content").contact
  };
}

function buildAdminDashboard(session) {
  const applications = getAllApplications();
  const borrowers = getAllBorrowers();
  const supportThreads = getAllSupportThreads();
  const notifications = getNotifications("admin", String(session.actorId));

  return {
    admin: {
      id: session.actorId,
      fullName: session.actorName
    },
    metrics: {
      pendingApplications: applications.filter((item) => item.status === "submitted").length,
      inReview: applications.filter((item) => item.status === "under_review" || item.status === "needs_documents").length,
      awaitingSuperAdmin: applications.filter((item) => item.status === "awaiting_super_admin").length,
      activeBorrowers: borrowers.filter((item) => item.account_status === "active").length,
      supportThreads: supportThreads.length
    },
    applications: applications.map(mapApplicationForAdmin),
    borrowers: borrowers.map((borrower) => ({
      ...sanitizeBorrower(borrower),
      loanSummary: getBorrowerLoans(borrower.id).map(mapLoanForClient),
      latestScore: ensureScoreSnapshot(borrower.id)
    })),
    supportThreads,
    notifications,
    activity: getRecentActivity(30)
  };
}

function buildSuperAdminDashboard(session) {
  const applications = getAllApplications();
  const admins = getAllAdmins();
  const borrowers = getAllBorrowers();
  const publicContent = getSetting("public_content");

  return {
    superAdmin: {
      id: session.actorId,
      fullName: session.actorName
    },
    metrics: {
      totalAdmins: admins.length,
      activeAdmins: admins.filter((item) => item.status === "active").length,
      suspendedAdmins: admins.filter((item) => item.status === "suspended").length,
      decisionsWaiting: applications.filter((item) => item.status === "awaiting_super_admin").length,
      activeBorrowers: borrowers.filter((item) => item.account_status === "active").length
    },
    applications: applications.map(mapApplicationForAdmin),
    admins: admins.map(sanitizeAdmin),
    audit: getRecentActivity(60),
    notifications: getNotifications("super_admin", String(session.actorId)),
    publicContent
  };
}

function registerBorrower(body) {
  const fullName = String(
    body.fullName ||
    body.full_name ||
    body.name ||
    body.displayName ||
    ""
  ).trim();
  const phone = normalizePhone(
    body.country || body.countryCode || body.country_code,
    body.phone || body.phoneNumber || body.phone_number || body.msisdn
  );
  const email = String(body.email || body.emailAddress || body.email_address || "").trim();
  const pin = String(body.pin || body.pinCode || body.pin_code || body.password || "");

  if (!fullName || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
    throw createHttpError(400, "Enter a full name and a 6-digit PIN.");
  }

  if (db.prepare("SELECT id FROM borrowers WHERE phone = ?").get(phone)) {
    throw createHttpError(409, "An account with this phone number already exists.");
  }

  const now = nowIso();
  const referralCode = `CRANE-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

  const statement = db.prepare(`
    INSERT INTO borrowers (full_name, phone, email, country, pin_hash, referral_code, account_status, member_since, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `);

  const result = statement.run(
    fullName,
    phone,
    email || null,
    String(body.country || body.countryCode || body.country_code || "UG"),
    hashSecret(pin),
    referralCode,
    now,
    now
  );

  addSupportMessage(Number(result.lastInsertRowid), "system", "system", "Welcome to Crane Credit Support! Ask us anything about your application, repayments, or account.");

  return getBorrowerById(Number(result.lastInsertRowid));
}

function loginBorrower(body) {
  const phone = normalizePhone(
    body.country || body.countryCode || body.country_code,
    body.phone || body.phoneNumber || body.phone_number || body.msisdn
  );
  const pin = String(body.pin || body.pinCode || body.pin_code || body.password || "");
  const borrower = db.prepare("SELECT * FROM borrowers WHERE phone = ?").get(phone);

  if (!borrower || !verifySecret(pin, borrower.pin_hash)) {
    throw createHttpError(401, "Phone number or PIN is incorrect.");
  }

  if (borrower.account_status !== "active") {
    throw createHttpError(403, "Your account is not currently active.");
  }

  db.prepare("UPDATE borrowers SET last_login_at = ? WHERE id = ?").run(nowIso(), borrower.id);
  return getBorrowerById(borrower.id);
}

function loginAdmin(body) {
  const username = String(body.username || "").trim();
  const pin = String(body.pin || "");
  const admin = db.prepare("SELECT * FROM admins WHERE username = ?").get(username);

  if (!admin || !verifySecret(pin, admin.pin_hash)) {
    throw createHttpError(401, "Username or PIN is incorrect.");
  }

  if (admin.status !== "active") {
    throw createHttpError(403, "This admin account is suspended.");
  }

  db.prepare("UPDATE admins SET last_login_at = ? WHERE id = ?").run(nowIso(), admin.id);
  return db.prepare("SELECT * FROM admins WHERE id = ?").get(admin.id);
}

function assertSuperAdminCredentials(body) {
  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  if (username !== env.masterAdminUsername || password !== env.masterAdminPassword) {
    throw createHttpError(401, "Super admin credentials are incorrect.");
  }
}

async function createLoanApplication(borrowerId, body) {
  const borrower = getBorrowerById(borrowerId);
  if (!borrower) {
    throw createHttpError(404, "Borrower account not found.");
  }

  const documents = Array.isArray(body.documents) ? body.documents : [];
  const requiredTypes = ["id_front", "id_back", "income_proof", "selfie_photo"];

  if (!documents.length || requiredTypes.some((type) => !documents.find((item) => item.type === type))) {
    throw createHttpError(400, "Required loan documents are missing.");
  }

  const amountRequested = Number(body.amountRequested || 0);
  const termMonths = Number(body.termMonths || 0);
  if (!amountRequested || !termMonths) {
    throw createHttpError(400, "Loan amount and preferred term are required.");
  }

  const id = createPublicId("APP");
  const now = nowIso();
  const applicant = {
    fullName: String(body.fullName || "").trim(),
    phone: String(body.phone || "").trim(),
    email: String(body.email || "").trim(),
    idNumber: String(body.idNumber || "").trim(),
    dateOfBirth: String(body.dateOfBirth || ""),
    district: String(body.district || ""),
    subcounty: String(body.subcounty || ""),
    village: String(body.village || ""),
    category: String(body.category || ""),
    purpose: String(body.purpose || "")
  };
  const employment = {
    employerName: String(body.employerName || ""),
    positionTitle: String(body.positionTitle || ""),
    employmentTenure: String(body.employmentTenure || ""),
    businessName: String(body.businessName || ""),
    businessType: String(body.businessType || ""),
    businessRegistration: String(body.businessRegistration || ""),
    monthlyIncome: Number(body.monthlyIncome || 0),
    otherIncome: Number(body.otherIncome || 0),
    existingObligations: String(body.existingObligations || "")
  };

  db.prepare(`
    INSERT INTO loan_applications (
      id, borrower_id, amount_requested, term_months, purpose, applicant_json, employment_json,
      status, admin_stage, submitted_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', 'queue', ?, ?)
  `).run(
    id,
    borrowerId,
    amountRequested,
    termMonths,
    applicant.purpose,
    JSON.stringify(applicant),
    JSON.stringify(employment),
    now,
    now
  );

  const uploadRoot = path.join(UPLOAD_DIR, id);
  ensureDirectory(uploadRoot);

  for (const document of documents) {
    await persistApplicationDocument(id, uploadRoot, document);
  }

  ensureScoreSnapshot(borrowerId);
  return db.prepare("SELECT * FROM loan_applications WHERE id = ?").get(id);
}

async function persistApplicationDocument(applicationId, uploadRoot, document) {
  const base64Match = String(document.dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!base64Match) {
    throw createHttpError(400, "Documents must be uploaded as image files.");
  }

  const mimeType = base64Match[1];
  const data = base64Match[2];
  const extension = extensionFromMime(mimeType);
  const safeName = slugify(document.type || "document");
  const fileName = `${safeName}-${Date.now()}.${extension}`;
  const filePath = path.join(uploadRoot, fileName);

  await fsp.writeFile(filePath, Buffer.from(data, "base64"));

  db.prepare(`
    INSERT INTO loan_documents (loan_application_id, doc_type, label, mime_type, file_name, file_path, uploaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    applicationId,
    String(document.type || "document"),
    String(document.label || "Document"),
    mimeType,
    fileName,
    filePath,
    nowIso()
  );
}

function makeRepayment(borrowerId, body) {
  const loanId = String(body.loanId || "");
  const amount = Math.max(0, Number(body.amount || 0));
  const paymentType = String(body.paymentType || "full");
  const channel = String(body.channel || "MTN Mobile Money");
  const loan = db.prepare("SELECT * FROM loans WHERE id = ? AND borrower_id = ?").get(loanId, borrowerId);

  if (!loan) {
    throw createHttpError(404, "Loan not found.");
  }

  if (loan.status !== "active") {
    throw createHttpError(400, "Only active loans can receive repayments.");
  }

  const paymentAmount = Math.min(amount || loan.installment_amount, loan.outstanding_amount);
  if (!paymentAmount) {
    throw createHttpError(400, "Repayment amount must be greater than zero.");
  }

  const newOutstanding = Math.max(0, loan.outstanding_amount - paymentAmount);
  const newPaid = loan.paid_amount + paymentAmount;
  const newStatus = newOutstanding === 0 ? "completed" : "active";
  const nextDueDate = newStatus === "completed" ? loan.next_due_date : addDaysIso(loan.next_due_date, 30);
  const now = nowIso();

  db.prepare(`
    UPDATE loans
    SET outstanding_amount = ?, paid_amount = ?, status = ?, next_due_date = ?, updated_at = ?
    WHERE id = ?
  `).run(newOutstanding, newPaid, newStatus, nextDueDate, now, loan.id);

  db.prepare(`
    INSERT INTO repayments (loan_id, borrower_id, amount, payment_type, channel, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'successful', ?)
  `).run(loan.id, borrowerId, paymentAmount, paymentType, channel, now);

  ensureScoreSnapshot(borrowerId);
  return db.prepare("SELECT * FROM repayments WHERE id = last_insert_rowid()").get();
}

function reviewApplicationByAdmin(session, applicationId, body) {
  const application = db.prepare("SELECT * FROM loan_applications WHERE id = ?").get(applicationId);
  if (!application) {
    throw createHttpError(404, "Loan application not found.");
  }

  const status = String(body.status || "");
  const allowed = new Set(["under_review", "needs_documents", "rejected_by_admin", "awaiting_super_admin"]);
  if (!allowed.has(status)) {
    throw createHttpError(400, "Unsupported admin action.");
  }

  const note = String(body.note || "").trim();
  const recommendedAmount = Number(body.recommendedAmount || application.amount_requested);
  const recommendedRate = Number(body.recommendedRate || getSetting("credit_policy").baseMonthlyRate);
  const installment = Number(body.recommendedInstallment || estimateInstallment(recommendedAmount, recommendedRate, application.term_months));
  const payoutEta = String(body.payoutEta || "Same day");
  const now = nowIso();

  db.prepare(`
    UPDATE loan_applications
    SET status = ?, admin_stage = ?, admin_note = ?, recommended_amount = ?, recommended_rate = ?,
        recommended_installment = ?, payout_eta = ?, admin_id = ?, updated_at = ?
    WHERE id = ?
  `).run(
    status,
    status === "awaiting_super_admin" ? "decision_waiting" : status,
    note || null,
    recommendedAmount,
    recommendedRate,
    installment,
    payoutEta,
    Number(session.actorId),
    now,
    applicationId
  );

  const borrower = getBorrowerById(application.borrower_id);
  const humanStatus = humanizeStatus(status);
  createNotification("borrower", String(application.borrower_id), "Application update", `${applicationId} is now ${humanStatus}.`, status === "rejected_by_admin" ? "danger" : "info");
  if (status === "awaiting_super_admin") {
    createNotification("super_admin", null, "Loan decision needed", `${applicationId} is ready for super admin approval.`, "info");
  }

  logActivity("admin", session.actorId, session.actorName, `set application to ${status}`, "loan_application", applicationId, {
    note,
    recommendedAmount,
    recommendedRate,
    installment
  });
  ensureScoreSnapshot(application.borrower_id);
}

function createAdmin(session, body) {
  const fullName = String(body.fullName || body.full_name || body.name || "").trim();
  const username = String(body.username || body.userName || body.adminUsername || "").trim();
  const email = String(body.email || body.emailAddress || body.email_address || "").trim();
  const phone = String(body.phone || body.phoneNumber || body.phone_number || "").trim();
  const pin = String(body.pin || body.pinCode || body.pin_code || "").trim();

  if (!fullName || !username || !/^\d{6}$/.test(pin)) {
    throw createHttpError(400, "Admin full name, username, and 6-digit PIN are required.");
  }

  if (db.prepare("SELECT id FROM admins WHERE username = ?").get(username)) {
    throw createHttpError(409, "That admin username already exists.");
  }

  const permissions = Array.isArray(body.permissions) && body.permissions.length
    ? body.permissions
    : ["review_loans", "view_documents", "reply_support"];

  const now = nowIso();
  const result = db.prepare(`
    INSERT INTO admins (full_name, username, email, phone, pin_hash, status, permissions_json, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `).run(fullName, username, email || null, phone || null, hashSecret(pin), JSON.stringify(permissions), session.actorName, now);

  logActivity("super_admin", session.actorId, session.actorName, "created admin account", "admin", String(result.lastInsertRowid), {
    username
  });

  createNotification("admin", String(result.lastInsertRowid), "Admin account created", "Your Crane admin account is ready. Sign in to begin reviewing applications.", "success");
  return db.prepare("SELECT * FROM admins WHERE id = ?").get(Number(result.lastInsertRowid));
}

function updateAdminStatus(session, adminId, body) {
  const admin = db.prepare("SELECT * FROM admins WHERE id = ?").get(Number(adminId));
  if (!admin) {
    throw createHttpError(404, "Admin account not found.");
  }

  const status = String(body.status || "");
  if (!["active", "suspended"].includes(status)) {
    throw createHttpError(400, "Unsupported admin status.");
  }

  db.prepare("UPDATE admins SET status = ? WHERE id = ?").run(status, Number(adminId));
  logActivity("super_admin", session.actorId, session.actorName, `updated admin status to ${status}`, "admin", String(adminId), {});
  createNotification("admin", String(adminId), "Admin account updated", `Your admin account is now ${humanizeStatus(status)}.`, status === "active" ? "success" : "warning");
}

function updateAdminPinBySuperAdmin(session, adminId, body) {
  const admin = db.prepare("SELECT * FROM admins WHERE id = ?").get(Number(adminId));
  if (!admin) {
    throw createHttpError(404, "Admin account not found.");
  }

  const pin = String(body.pin || body.pinCode || body.pin_code || body.password || "").trim();
  if (!/^\d{6}$/.test(pin)) {
    throw createHttpError(400, "Admin PIN must be exactly 6 digits.");
  }

  db.prepare("UPDATE admins SET pin_hash = ? WHERE id = ?").run(hashSecret(pin), Number(adminId));
  db.prepare("DELETE FROM sessions WHERE actor_role = 'admin' AND actor_id = ?").run(String(adminId));
  logActivity("super_admin", session.actorId, session.actorName, "reset admin PIN", "admin", String(adminId), {
    username: admin.username
  });
  createNotification("admin", String(adminId), "Admin PIN reset", "Your admin PIN was updated by the super admin. Sign in again using the new PIN.", "warning");
}

function deleteAdmin(session, adminId) {
  const admin = db.prepare("SELECT * FROM admins WHERE id = ?").get(Number(adminId));
  if (!admin) {
    throw createHttpError(404, "Admin account not found.");
  }

  db.prepare("DELETE FROM admins WHERE id = ?").run(Number(adminId));
  db.prepare("DELETE FROM sessions WHERE actor_role = 'admin' AND actor_id = ?").run(String(adminId));
  logActivity("super_admin", session.actorId, session.actorName, "deleted admin account", "admin", String(adminId), {
    username: admin.username
  });
}

function updateBorrowerPinByAdmin(session, borrowerId, body) {
  const borrower = db.prepare("SELECT * FROM borrowers WHERE id = ?").get(Number(borrowerId));
  if (!borrower) {
    throw createHttpError(404, "Borrower account not found.");
  }

  const pin = String(body.pin || body.pinCode || body.pin_code || body.password || "").trim();
  if (!/^\d{6}$/.test(pin)) {
    throw createHttpError(400, "Borrower PIN must be exactly 6 digits.");
  }

  db.prepare("UPDATE borrowers SET pin_hash = ? WHERE id = ?").run(hashSecret(pin), Number(borrowerId));
  db.prepare("DELETE FROM sessions WHERE actor_role = 'borrower' AND actor_id = ?").run(String(borrowerId));
  logActivity("admin", session.actorId, session.actorName, "reset borrower PIN", "borrower", String(borrowerId), {
    borrowerName: borrower.full_name
  });
  createNotification("borrower", String(borrowerId), "Account PIN updated", "Your account PIN was updated by the admin team. Sign in again using the new PIN.", "warning");
  addSupportMessage(Number(borrowerId), "system", "system", `Your account PIN was updated by ${session.actorName}. If you did not expect this change, contact support immediately.`);
}

function decideApplicationBySuperAdmin(session, applicationId, body) {
  const application = db.prepare("SELECT * FROM loan_applications WHERE id = ?").get(applicationId);
  if (!application) {
    throw createHttpError(404, "Loan application not found.");
  }

  const decision = String(body.decision || "");
  if (!["approve", "reject"].includes(decision)) {
    throw createHttpError(400, "Decision must be approve or reject.");
  }

  const note = String(body.note || "").trim();
  const now = nowIso();

  if (decision === "reject") {
    db.prepare(`
      UPDATE loan_applications
      SET status = 'rejected_by_super_admin', super_admin_note = ?, super_admin_id = ?, rejected_at = ?, updated_at = ?
      WHERE id = ?
    `).run(note || null, session.actorId, now, now, applicationId);

    createNotification("borrower", String(application.borrower_id), "Loan request declined", `${applicationId} was not approved at the final stage.`, "danger");
    logActivity("super_admin", session.actorId, session.actorName, "rejected application", "loan_application", applicationId, { note });
    ensureScoreSnapshot(application.borrower_id);
    return;
  }

  const principalAmount = Number(body.approvedAmount || application.recommended_amount || application.amount_requested);
  const interestRate = Number(body.interestRate || application.recommended_rate || getSetting("credit_policy").baseMonthlyRate);
  const termMonths = Number(body.termMonths || application.term_months);
  const installmentAmount = Number(body.installmentAmount || application.recommended_installment || estimateInstallment(principalAmount, interestRate, termMonths));
  const totalRepayable = installmentAmount * termMonths;
  const loanId = createPublicId("LN");
  const startDate = now;
  const nextDueDate = addDaysIso(now, 30);

  db.prepare(`
    UPDATE loan_applications
    SET status = 'approved', super_admin_note = ?, super_admin_id = ?, approved_at = ?, updated_at = ?, recommended_amount = ?, recommended_rate = ?, recommended_installment = ?
    WHERE id = ?
  `).run(note || null, session.actorId, now, now, principalAmount, interestRate, installmentAmount, applicationId);

  db.prepare(`
    INSERT INTO loans (
      id, application_id, borrower_id, principal_amount, interest_rate, total_repayable, outstanding_amount,
      installment_amount, term_months, status, start_date, next_due_date, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
  `).run(
    loanId,
    applicationId,
    application.borrower_id,
    principalAmount,
    interestRate,
    totalRepayable,
    totalRepayable,
    installmentAmount,
    termMonths,
    startDate,
    nextDueDate,
    now,
    now
  );

  createNotification("borrower", String(application.borrower_id), "Loan approved", `${applicationId} was approved. Your loan ${loanId} is now active.`, "success");
  createNotification("admin", null, "Loan approved", `${applicationId} was approved by super admin.`, "success");
  logActivity("super_admin", session.actorId, session.actorName, "approved application", "loan_application", applicationId, {
    loanId,
    principalAmount,
    interestRate,
    installmentAmount
  });
  ensureScoreSnapshot(application.borrower_id);
}

function addSupportMessage(borrowerId, senderRole, senderId, message) {
  const content = String(message || "").trim();
  if (!content) {
    return;
  }

  db.prepare(`
    INSERT INTO support_messages (borrower_id, sender_role, sender_id, message, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(borrowerId, senderRole, senderId, content, nowIso());
}

function getSupportMessages(borrowerId) {
  return db.prepare(`
    SELECT *
    FROM support_messages
    WHERE borrower_id = ?
    ORDER BY created_at ASC, id ASC
  `).all(borrowerId).map((message) => ({
    id: message.id,
    senderRole: message.sender_role,
    senderId: message.sender_id,
    message: message.message,
    createdAt: message.created_at
  }));
}

function getAllSupportThreads() {
  const borrowers = getAllBorrowers();
  return borrowers
    .map((borrower) => ({
      borrower: sanitizeBorrower(borrower),
      messages: getSupportMessages(borrower.id)
    }))
    .filter((thread) => thread.messages.length > 0)
    .sort((a, b) => (b.messages.at(-1)?.createdAt || "").localeCompare(a.messages.at(-1)?.createdAt || ""));
}

function getBorrowerById(id) {
  return db.prepare("SELECT * FROM borrowers WHERE id = ?").get(id);
}

function getAllBorrowers() {
  return db.prepare("SELECT * FROM borrowers ORDER BY created_at DESC").all();
}

function getAllAdmins() {
  return db.prepare("SELECT * FROM admins ORDER BY created_at DESC").all();
}

function getBorrowerLoans(borrowerId) {
  return db.prepare("SELECT * FROM loans WHERE borrower_id = ? ORDER BY created_at DESC").all(borrowerId);
}

function getBorrowerApplications(borrowerId) {
  return db.prepare("SELECT * FROM loan_applications WHERE borrower_id = ? ORDER BY submitted_at DESC").all(borrowerId);
}

function getAllApplications() {
  return db.prepare("SELECT * FROM loan_applications ORDER BY submitted_at DESC").all();
}

function getBorrowerReferrals(borrowerId) {
  return db.prepare("SELECT * FROM referrals WHERE borrower_id = ? ORDER BY created_at DESC").all(borrowerId).map((row) => ({
    name: row.referred_name,
    date: row.created_at,
    level: row.level,
    earned: row.earned_amount,
    status: row.status
  }));
}

function getNotifications(role, actorId) {
  return db.prepare(`
    SELECT *
    FROM notifications
    WHERE recipient_role = ?
      AND (recipient_id IS NULL OR recipient_id = ?)
    ORDER BY created_at DESC, id DESC
    LIMIT 40
  `).all(role, actorId).map((item) => ({
    id: item.id,
    title: item.title,
    message: item.message,
    level: item.level,
    isRead: Boolean(item.is_read),
    createdAt: item.created_at
  }));
}

function createNotification(role, actorId, title, message, level) {
  db.prepare(`
    INSERT INTO notifications (recipient_role, recipient_id, title, message, level, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(role, actorId, title, message, level, nowIso());
}

function getRecentActivity(limit) {
  return db.prepare(`
    SELECT *
    FROM activity_log
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(limit).map((row) => ({
    id: row.id,
    actorRole: row.actor_role,
    actorName: row.actor_name,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    details: safeJsonParse(row.details_json, {}),
    createdAt: row.created_at
  }));
}

function logActivity(actorRole, actorId, actorName, action, targetType, targetId, details) {
  db.prepare(`
    INSERT INTO activity_log (actor_role, actor_id, actor_name, action, target_type, target_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(actorRole, String(actorId), actorName, action, targetType, String(targetId), JSON.stringify(details || {}), nowIso());
}

function ensureScoreSnapshot(borrowerId) {
  const borrower = getBorrowerById(borrowerId);
  const loans = getBorrowerLoans(borrowerId);
  const applications = getBorrowerApplications(borrowerId);
  const repayments = db.prepare("SELECT * FROM repayments WHERE borrower_id = ? ORDER BY created_at DESC").all(borrowerId);

  if (!borrower) {
    return {
      current: null,
      grade: "No score yet",
      drivers: [],
      history: []
    };
  }

  const activeLoans = loans.filter((loan) => loan.status === "active");
  const completedLoans = loans.filter((loan) => loan.status === "completed");
  const overdueLoans = activeLoans.filter((loan) => new Date(loan.next_due_date) < new Date());
  const totalOutstanding = activeLoans.reduce((sum, loan) => sum + loan.outstanding_amount, 0);
  const totalPrincipal = loans.reduce((sum, loan) => sum + loan.principal_amount, 0) || 1;
  const utilization = totalOutstanding / totalPrincipal;
  const recentApproved = applications.some((item) => item.status === "approved");

  let score = 520;
  score += Math.min(completedLoans.length * 18, 90);
  score += Math.min(repayments.length * 6, 60);
  score += activeLoans.length ? 25 : 0;
  score += recentApproved ? 35 : 0;
  score -= overdueLoans.length * 55;
  score -= Math.round(utilization * 80);
  score = Math.max(300, Math.min(850, score));

  const grade = score >= 760 ? "Elite" : score >= 700 ? "Strong" : score >= 620 ? "Healthy" : score >= 540 ? "Watch" : "Needs rebuild";
  const drivers = [
    {
      title: "Repayment streak",
      value: repayments.length ? `${repayments.length} recorded payment${repayments.length === 1 ? "" : "s"}` : "No payment record yet",
      tone: repayments.length ? "positive" : "neutral"
    },
    {
      title: "Loan utilization",
      value: `${Math.round(utilization * 100)}% currently outstanding`,
      tone: utilization < 0.45 ? "positive" : utilization < 0.75 ? "neutral" : "warning"
    },
    {
      title: "Completion history",
      value: `${completedLoans.length} completed loan${completedLoans.length === 1 ? "" : "s"}`,
      tone: completedLoans.length ? "positive" : "neutral"
    },
    {
      title: "Timeliness",
      value: overdueLoans.length ? `${overdueLoans.length} overdue account${overdueLoans.length === 1 ? "" : "s"}` : "No overdue loan detected",
      tone: overdueLoans.length ? "warning" : "positive"
    }
  ];

  const latest = db.prepare(`
    SELECT *
    FROM score_history
    WHERE borrower_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(borrowerId);

  if (!latest || latest.score !== score || latest.grade !== grade) {
    db.prepare(`
      INSERT INTO score_history (borrower_id, score, grade, factors_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(borrowerId, score, grade, JSON.stringify(drivers), nowIso());
  }

  const history = db.prepare(`
    SELECT *
    FROM score_history
    WHERE borrower_id = ?
    ORDER BY created_at ASC, id ASC
    LIMIT 12
  `).all(borrowerId).map((row) => ({
    score: row.score,
    grade: row.grade,
    createdAt: row.created_at
  }));

  return {
    current: score,
    grade,
    drivers,
    history
  };
}

function getSetting(key) {
  const row = db.prepare("SELECT value_json FROM settings WHERE key = ?").get(key);
  return row ? safeJsonParse(row.value_json, {}) : {};
}

function updateSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), nowIso());
}

function computeLiveStats() {
  const today = nowIso().slice(0, 10);
  const approvedToday = db.prepare(`
    SELECT COUNT(*) AS total
    FROM loan_applications
    WHERE status = 'approved' AND approved_at LIKE ?
  `).get(`${today}%`).total;

  const decided = db.prepare(`
    SELECT COUNT(*) AS total
    FROM loan_applications
    WHERE status IN ('approved', 'rejected_by_super_admin', 'rejected_by_admin')
  `).get().total;

  const approved = db.prepare(`
    SELECT COUNT(*) AS total
    FROM loan_applications
    WHERE status = 'approved'
  `).get().total;

  const repeat = db.prepare(`
    SELECT COUNT(*) AS total
    FROM (
      SELECT borrower_id
      FROM loan_applications
      GROUP BY borrower_id
      HAVING COUNT(*) > 1
    )
  `).get().total;

  const borrowerCount = db.prepare("SELECT COUNT(*) AS total FROM borrowers").get().total || 1;

  return {
    approvedToday,
    approvalRate: decided ? Math.round((approved / decided) * 100) : 92,
    repeatBorrowers: Math.round((repeat / borrowerCount) * 100) || 0
  };
}

function buildOfferMatch(score, latestApplication) {
  const configured = getSetting("public_content").offer;
  if (!score.current) {
    return configured;
  }

  const multiplier = score.current >= 760 ? 1.4 : score.current >= 700 ? 1.2 : score.current >= 620 ? 1 : 0.75;
  const amount = Math.round(configured.amount * multiplier);
  const rate = Math.max(0.9, configured.rate - (score.current >= 700 ? 0.3 : 0));

  return {
    title: latestApplication?.status === "approved" ? "Repeat Growth Line" : configured.title,
    amount,
    rate,
    installment: estimateInstallment(amount, rate, 12),
    payout: latestApplication?.status === "awaiting_super_admin" ? "After final approval" : configured.payout,
    message: score.current >= 700 ? "Your account behavior is unlocking faster, larger offers." : configured.message
  };
}

function estimateInstallment(principal, monthlyRate, termMonths) {
  const total = principal * (1 + (monthlyRate / 100) * termMonths);
  return Math.ceil(total / termMonths);
}

async function serveDocument(req, res, documentId) {
  const session = getSessionFromRequest(req);
  if (!session) {
    sendJson(res, 401, { error: "Sign in is required to view documents." });
    return;
  }

  const documentRow = db.prepare(`
    SELECT d.*, a.borrower_id
    FROM loan_documents d
    JOIN loan_applications a ON a.id = d.loan_application_id
    WHERE d.id = ?
  `).get(Number(documentId));

  if (!documentRow) {
    sendJson(res, 404, { error: "Document not found." });
    return;
  }

  const allowed =
    session.actorRole === "super_admin" ||
    session.actorRole === "admin" ||
    (session.actorRole === "borrower" && Number(session.actorId) === documentRow.borrower_id);

  if (!allowed) {
    sendJson(res, 403, { error: "You do not have access to this document." });
    return;
  }

  const fileBuffer = await fsp.readFile(documentRow.file_path);
  res.writeHead(200, {
    "Content-Type": documentRow.mime_type,
    "Content-Length": fileBuffer.length
  });
  res.end(fileBuffer);
}

function mapLoanForClient(loan) {
  return {
    id: loan.id,
    applicationId: loan.application_id,
    principalAmount: loan.principal_amount,
    interestRate: loan.interest_rate,
    totalRepayable: loan.total_repayable,
    outstandingAmount: loan.outstanding_amount,
    installmentAmount: loan.installment_amount,
    termMonths: loan.term_months,
    status: loan.status,
    startDate: loan.start_date,
    nextDueDate: loan.next_due_date
  };
}

function mapApplicationForClient(application) {
  return {
    id: application.id,
    amountRequested: application.amount_requested,
    termMonths: application.term_months,
    purpose: application.purpose,
    status: application.status,
    adminStage: application.admin_stage,
    submittedAt: application.submitted_at,
    updatedAt: application.updated_at,
    recommendedAmount: application.recommended_amount,
    recommendedRate: application.recommended_rate,
    recommendedInstallment: application.recommended_installment,
    payoutEta: application.payout_eta,
    adminNote: application.admin_note,
    superAdminNote: application.super_admin_note
  };
}

function mapApplicationForAdmin(application) {
  const borrower = getBorrowerById(application.borrower_id);
  const applicant = safeJsonParse(application.applicant_json, {});
  const employment = safeJsonParse(application.employment_json, {});
  const documents = db.prepare(`
    SELECT *
    FROM loan_documents
    WHERE loan_application_id = ?
    ORDER BY id ASC
  `).all(application.id).map((doc) => ({
    id: doc.id,
    type: doc.doc_type,
    label: doc.label,
    fileName: doc.file_name,
    url: `/api/documents/${doc.id}`
  }));

  return {
    id: application.id,
    status: application.status,
    adminStage: application.admin_stage,
    amountRequested: application.amount_requested,
    termMonths: application.term_months,
    purpose: application.purpose,
    submittedAt: application.submitted_at,
    updatedAt: application.updated_at,
    recommendedAmount: application.recommended_amount,
    recommendedRate: application.recommended_rate,
    recommendedInstallment: application.recommended_installment,
    payoutEta: application.payout_eta,
    adminNote: application.admin_note,
    superAdminNote: application.super_admin_note,
    borrower: borrower ? sanitizeBorrower(borrower) : null,
    applicant,
    employment,
    documents
  };
}

function sanitizeBorrower(borrower) {
  return {
    id: borrower.id,
    fullName: borrower.full_name,
    phone: borrower.phone,
    email: borrower.email,
    country: borrower.country,
    accountStatus: borrower.account_status,
    memberSince: borrower.member_since,
    lastLoginAt: borrower.last_login_at,
    referralCode: borrower.referral_code
  };
}

function sanitizeAdmin(admin) {
  return {
    id: admin.id,
    fullName: admin.full_name,
    username: admin.username,
    email: admin.email,
    phone: admin.phone,
    status: admin.status,
    permissions: safeJsonParse(admin.permissions_json, []),
    createdBy: admin.created_by,
    createdAt: admin.created_at,
    lastLoginAt: admin.last_login_at
  };
}

function createSession(actorRole, actorId, actorName) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + env.sessionDays * 24 * 60 * 60 * 1000).toISOString();
  const now = nowIso();

  db.prepare(`
    INSERT INTO sessions (token, actor_role, actor_id, actor_name, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(token, actorRole, actorId, actorName, expiresAt, now);

  return { token, expiresAt };
}

function getSessionFromRequest(req) {
  const token = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  if (!token) {
    return null;
  }

  const session = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token);
  if (!session) {
    return null;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }

  return {
    token: session.token,
    actorRole: session.actor_role,
    actorId: session.actor_id,
    actorName: session.actor_name,
    expiresAt: session.expires_at
  };
}

function requireSession(req, expectedRole) {
  const session = getSessionFromRequest(req);
  if (!session) {
    throw createHttpError(401, "Sign in is required.");
  }

  if (expectedRole && session.actorRole !== expectedRole) {
    throw createHttpError(403, "You do not have access to this area.");
  }

  return session;
}

function clearCurrentSession(req, res) {
  const cookies = parseCookies(req.headers.cookie || "");
  if (cookies[SESSION_COOKIE]) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(cookies[SESSION_COOKIE]);
  }
  clearSessionCookie(req, res);
}

function setSessionCookie(req, res, token) {
  res.setHeader("Set-Cookie", buildSessionCookie(req, `${SESSION_COOKIE}=${token}`, env.sessionDays * 24 * 60 * 60));
}

function clearSessionCookie(req, res) {
  res.setHeader("Set-Cookie", buildSessionCookie(req, `${SESSION_COOKIE}=`, 0));
}

function openEventStream(req, res, session) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });

  res.write(`event: hello\ndata: ${JSON.stringify({ now: nowIso() })}\n\n`);
  const client = {
    res,
    role: session?.actorRole || "public",
    actorId: session?.actorId || null
  };
  sseClients.add(client);

  const keepAlive = setInterval(() => {
    res.write(`event: ping\ndata: ${JSON.stringify({ now: nowIso() })}\n\n`);
  }, 20000);

  req.on("close", () => {
    clearInterval(keepAlive);
    sseClients.delete(client);
  });
}

function broadcastRoleRefresh(roles) {
  broadcastEvent("refresh", { scope: "roles", roles });
}

function broadcastPublicRefresh() {
  broadcastEvent("refresh", { scope: "public" });
}

function broadcastEvent(eventName, payload) {
  const encoded = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    const shouldSend =
      payload.scope === "public" ||
      (payload.scope === "roles" && payload.roles.includes(client.role));

    if (shouldSend) {
      client.res.write(encoded);
    }
  }
}

async function serveStatic(pathname, res) {
  let filePath = pathname === "/" ? path.join(ROOT, "index.html") : path.join(ROOT, pathname);
  filePath = path.normalize(filePath);

  if (!filePath.startsWith(ROOT)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    sendText(res, 404, "Not found");
    return;
  }

  if (stat.isDirectory()) {
    sendText(res, 404, "Not found");
    return;
  }

  const contentType = mimeTypeForPath(filePath);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": isCacheSensitive(filePath) ? "no-store" : "public, max-age=86400"
  });
  fs.createReadStream(filePath).pipe(res);
}

async function readJson(req) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_JSON_BYTES) {
      throw createHttpError(413, "Request payload is too large.");
    }
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw createHttpError(400, "Invalid JSON body.");
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function parseCookies(cookieHeader) {
  return cookieHeader
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const index = part.indexOf("=");
      const key = index === -1 ? part : part.slice(0, index);
      const value = index === -1 ? "" : part.slice(index + 1);
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function nowIso() {
  return new Date().toISOString();
}

function addDaysIso(dateValue, days) {
  const date = new Date(dateValue);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function ensureDirectory(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.scryptSync(secret, salt, 64).toString("hex");
  return `scrypt$${salt}$${digest}`;
}

function verifySecret(secret, encoded) {
  const parts = String(encoded).split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }
  const digest = crypto.scryptSync(secret, parts[1], 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(parts[2], "hex"));
}

function normalizePhone(country, rawPhone) {
  const dialCodes = {
    UG: "+256",
    KE: "+254",
    TZ: "+255",
    NG: "+234"
  };
  const digits = String(rawPhone || "").replace(/\D/g, "");
  const prefix = dialCodes[String(country || "UG").toUpperCase()] || "+256";
  if (!digits) {
    throw createHttpError(400, "Phone number is required.");
  }
  const normalized = digits.startsWith("0") ? digits.slice(1) : digits;
  return `${prefix}${normalized}`;
}

function createPublicId(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "file";
}

function extensionFromMime(mimeType) {
  const map = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  };
  return map[mimeType] || "png";
}

function mimeTypeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".avif": "image/avif"
  };
  return map[ext] || "application/octet-stream";
}

function isCacheSensitive(filePath) {
  return [".html", ".js"].includes(path.extname(filePath).toLowerCase());
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function humanizeStatus(status) {
  return String(status || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function applyCorsHeaders(req, res) {
  const allowedOrigin = getAllowedOrigin(req);
  if (!allowedOrigin) {
    return;
  }

  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Vary", "Origin");
}

function getAllowedOrigin(req) {
  const origin = req.headers.origin || "";
  if (!origin || !env.corsOrigins.length) {
    return "";
  }

  if (env.corsOrigins.includes("*") || env.corsOrigins.includes(origin)) {
    return origin;
  }

  return "";
}

function buildSessionCookie(req, basePair, maxAgeSeconds) {
  const attributes = [basePair, "Path=/", "HttpOnly", `Max-Age=${maxAgeSeconds}`];
  if (shouldUseCrossSiteCookie(req)) {
    attributes.push("SameSite=None", "Secure");
  } else {
    attributes.push("SameSite=Lax");
  }
  return attributes.join("; ");
}

function shouldUseCrossSiteCookie(req) {
  const origin = getAllowedOrigin(req);
  if (!origin) {
    return false;
  }

  try {
    const parsed = new URL(origin);
    return parsed.protocol === "https:" && !["localhost", "127.0.0.1"].includes(parsed.hostname);
  } catch (error) {
    return false;
  }
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection", error);
});
