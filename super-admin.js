(function superAdminWorkspace() {
  const shared = window.CraneShared;
  const state = {
    dashboard: null,
    currentView: "overview",
    selectedApplicationId: null
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", async () => {
    cacheDom();
    bindViewButtons();
    bindActions();
    await loadDashboard();
    connectEvents();
  });

  function cacheDom() {
    const ids = [
      "super-admin-name-display", "super-metric-admins", "super-metric-active-admins", "super-metric-suspended-admins",
      "super-metric-decisions", "super-metric-borrowers", "super-overview-decision-feed", "super-notification-feed",
      "super-overview-audit-feed", "decision-application-list", "decision-application-detail", "decision-amount",
      "decision-rate", "decision-installment", "decision-term", "decision-note", "decision-feedback", "decision-approve",
      "decision-reject", "create-admin-form", "new-admin-name", "new-admin-username", "new-admin-email", "new-admin-phone",
      "new-admin-pin", "admin-create-feedback", "admin-account-list", "public-content-form", "ticker-one", "ticker-two",
      "ticker-three", "offer-title-input", "offer-amount-input", "offer-rate-input", "offer-installment-input",
      "offer-payout-input", "offer-message-input", "contact-phone-input", "contact-whatsapp-input", "contact-email-input",
      "public-content-feedback", "announcement-form", "announcement-title", "announcement-target", "announcement-message",
      "announcement-feedback", "audit-log-list", "super-audit-notification-feed", "super-admin-logout-btn",
      "super-header-brand-btn", "super-quick-view-btn", "super-notification-btn", "super-notification-badge",
      "super-notification-panel", "super-close-notifications", "super-notification-list"
    ];

    ids.forEach((id) => {
      dom[toCamel(id)] = document.getElementById(id);
    });

    dom.viewButtons = [...document.querySelectorAll("[data-super-view]")];
    dom.views = {
      overview: document.getElementById("super-overview-view"),
      decisions: document.getElementById("super-decisions-view"),
      admins: document.getElementById("super-admins-view"),
      "live-content": document.getElementById("super-live-content-view"),
      audit: document.getElementById("super-audit-view")
    };
  }

  function bindViewButtons() {
    dom.viewButtons.forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.superView));
    });
  }

  function bindActions() {
    dom.decisionApprove?.addEventListener("click", () => submitDecision("approve"));
    dom.decisionReject?.addEventListener("click", () => submitDecision("reject"));
    dom.createAdminForm?.addEventListener("submit", createAdmin);
    dom.publicContentForm?.addEventListener("submit", publishContent);
    dom.announcementForm?.addEventListener("submit", sendAnnouncement);
    dom.superAdminLogoutBtn?.addEventListener("click", logout);
    dom.superHeaderBrandBtn?.addEventListener("click", () => setView("overview"));
    dom.superQuickViewBtn?.addEventListener("click", () => setView("decisions"));
    dom.superNotificationBtn?.addEventListener("click", () => {
      dom.superNotificationPanel?.classList.add("active");
    });
    dom.superCloseNotifications?.addEventListener("click", () => {
      dom.superNotificationPanel?.classList.remove("active");
    });
  }

  async function loadDashboard() {
    try {
      const data = await api("/api/super-admin/dashboard");
      state.dashboard = data;
      dom.superAdminNameDisplay.textContent = data.superAdmin.fullName;
      const awaiting = data.applications.filter((item) => item.status === "awaiting_super_admin");
      if (!state.selectedApplicationId && awaiting.length) {
        state.selectedApplicationId = awaiting[0].id;
      }
      render();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.href = "super-admin-login.html";
        return;
      }
      console.error(error);
    }
  }

  function connectEvents() {
    shared.connectEvents("super_admin", () => loadDashboard());
  }

  function render() {
    renderMetrics();
    renderOverview();
    renderDecisionQueue();
    renderAdminAccounts();
    renderPublicContentForm();
    renderAudit();
    renderNotifications();
    setView(state.currentView);
  }

  function renderNotifications() {
    const notifications = state.dashboard.notifications || [];
    dom.superNotificationBadge.textContent = String(notifications.length);
    dom.superNotificationList.innerHTML = notifications.length
      ? notifications.map((item) => `
          <article class="notification-item">
            <div class="notification-top">
              <strong>${escapeHtml(item.title)}</strong>
              <span class="detail-label">${formatDateTime(item.createdAt)}</span>
            </div>
            <div class="detail-subtext">${escapeHtml(item.message)}</div>
          </article>
        `).join("")
      : `<div class="panel-empty-state">No notifications yet.</div>`;
  }

  function renderMetrics() {
    const metrics = state.dashboard.metrics;
    dom.superMetricAdmins.textContent = metrics.totalAdmins;
    dom.superMetricActiveAdmins.textContent = metrics.activeAdmins;
    dom.superMetricSuspendedAdmins.textContent = metrics.suspendedAdmins;
    dom.superMetricDecisions.textContent = metrics.decisionsWaiting;
    dom.superMetricBorrowers.textContent = metrics.activeBorrowers;
  }

  function renderOverview() {
    const awaiting = state.dashboard.applications.filter((item) => item.status === "awaiting_super_admin").slice(0, 6);
    const notifications = state.dashboard.notifications.slice(0, 8);
    const audit = state.dashboard.audit.slice(0, 10);

    dom.superOverviewDecisionFeed.innerHTML = awaiting.length
      ? awaiting.map((item) => decisionCard(item)).join("")
      : `<div class="empty-block">No applications are waiting for final approval.</div>`;

    dom.superNotificationFeed.innerHTML = notifications.length
      ? notifications.map((item) => `
          <article class="notification-item">
            <div class="notification-top">
              <strong>${escapeHtml(item.title)}</strong>
              <span class="detail-label">${formatDateTime(item.createdAt)}</span>
            </div>
            <div class="detail-subtext">${escapeHtml(item.message)}</div>
          </article>
        `).join("")
      : `<div class="empty-block">No super admin notifications yet.</div>`;

    dom.superOverviewAuditFeed.innerHTML = audit.length
      ? audit.map((item) => `
          <article class="activity-item">
            <div class="activity-top">
              <strong>${escapeHtml(item.actorName)}</strong>
              <span class="detail-label">${formatDateTime(item.createdAt)}</span>
            </div>
            <div>${escapeHtml(item.action)}</div>
            <div class="detail-label">${escapeHtml(item.targetType)} • ${escapeHtml(item.targetId)}</div>
          </article>
        `).join("")
      : `<div class="empty-block">Audit entries will appear here.</div>`;
  }

  function renderDecisionQueue() {
    const awaiting = state.dashboard.applications.filter((item) => item.status === "awaiting_super_admin");
    const selected = awaiting.find((item) => item.id === state.selectedApplicationId) || awaiting[0] || null;
    if (selected && state.selectedApplicationId !== selected.id) {
      state.selectedApplicationId = selected.id;
    }

    dom.decisionApplicationList.innerHTML = awaiting.length
      ? awaiting.map((item) => decisionCard(item, item.id === state.selectedApplicationId)).join("")
      : `<div class="empty-block">No escalated applications are waiting right now.</div>`;

    dom.decisionApplicationList.querySelectorAll("[data-decision-id]").forEach((element) => {
      element.addEventListener("click", () => {
        state.selectedApplicationId = element.dataset.decisionId;
        renderDecisionQueue();
      });
    });

    if (!selected) {
      dom.decisionApplicationDetail.innerHTML = `<div class="detail-panel-empty">Select a queued application to review admin recommendations and uploaded documents.</div>`;
      return;
    }

    dom.decisionAmount.value = selected.recommendedAmount || selected.amountRequested;
    dom.decisionRate.value = selected.recommendedRate || 1.8;
    dom.decisionInstallment.value = selected.recommendedInstallment || "";
    dom.decisionTerm.value = selected.termMonths;
    dom.decisionNote.value = selected.superAdminNote || selected.adminNote || "";

    dom.decisionApplicationDetail.innerHTML = `
      <div class="detail-grid">
        <div><span>Application</span><strong>${escapeHtml(selected.id)}</strong></div>
        <div><span>Borrower</span><strong>${escapeHtml(selected.borrower?.fullName || "Unknown")}</strong></div>
        <div><span>Requested</span><strong>${formatCurrency(selected.amountRequested)}</strong></div>
        <div><span>Admin recommended</span><strong>${formatCurrency(selected.recommendedAmount || selected.amountRequested)}</strong></div>
        <div><span>Admin rate</span><strong>${selected.recommendedRate || "N/A"}% / month</strong></div>
        <div><span>Installment</span><strong>${selected.recommendedInstallment ? formatCurrency(selected.recommendedInstallment) : "Not set"}</strong></div>
      </div>
      <div class="detail-panel-empty">
        <strong>Admin note</strong>
        <div class="detail-subtext">${escapeHtml(selected.adminNote || "No note supplied by the reviewing admin.")}</div>
      </div>
      <div class="document-grid">
        ${selected.documents.length
          ? selected.documents.map((doc) => `
              <figure class="document-tile">
                <img src="${doc.url}" alt="${escapeHtml(doc.label)}">
                <figcaption>${escapeHtml(doc.label)}</figcaption>
              </figure>
            `).join("")
          : `<div class="detail-panel-empty">No documents available.</div>`}
      </div>
    `;

    updateDecisionButtons(selected);
  }

  function getDecisionButton(decision) {
    return decision === "approve" ? dom.decisionApprove : dom.decisionReject;
  }

  function updateDecisionButtons(selected) {
    const disabled = !selected;
    if (dom.decisionApprove) {
      dom.decisionApprove.disabled = disabled;
    }
    if (dom.decisionReject) {
      dom.decisionReject.disabled = disabled;
    }
  }

  function renderAdminAccounts() {
    const admins = state.dashboard.admins;
    dom.adminAccountList.innerHTML = admins.length
      ? admins.map((admin) => `
          <article class="admin-item">
            <div class="item-top">
              <strong>${escapeHtml(admin.fullName)}</strong>
              <span class="badge ${escapeHtml(admin.status)}">${humanize(admin.status)}</span>
            </div>
            <div class="detail-label">@${escapeHtml(admin.username)} • ${escapeHtml(admin.email || "No email")}</div>
            <div class="detail-label">Created ${formatDate(admin.createdAt)} by ${escapeHtml(admin.createdBy || "system")}</div>
            <div class="detail-stack">
              <strong>Reset admin PIN</strong>
              <div class="detail-subtext">Set a new 6-digit sign-in PIN for this admin account.</div>
              <div class="portal-field">
                <label for="admin-pin-reset-${admin.id}">New admin PIN</label>
                <input id="admin-pin-reset-${admin.id}" class="portal-input" type="password" maxlength="6" inputmode="numeric" pattern="[0-9]{6}" placeholder="Enter new 6-digit PIN" data-admin-pin-input-id="${admin.id}">
              </div>
              <div class="portal-success" data-admin-pin-feedback-id="${admin.id}"></div>
            </div>
            <div class="button-row">
              <button type="button" class="chip-btn" data-admin-pin-reset-id="${admin.id}">Update PIN</button>
              <button type="button" class="chip-btn" data-admin-status-id="${admin.id}" data-next-status="${admin.status === "active" ? "suspended" : "active"}">
                ${admin.status === "active" ? "Suspend" : "Reactivate"}
              </button>
              <button type="button" class="subtle-btn" data-admin-delete-id="${admin.id}">Delete</button>
            </div>
          </article>
        `).join("")
      : `<div class="empty-block">Create the first admin account to begin operations review.</div>`;

    dom.adminAccountList.querySelectorAll("[data-admin-status-id]").forEach((button) => {
      button.addEventListener("click", () => updateAdminStatus(button.dataset.adminStatusId, button.dataset.nextStatus));
    });

    dom.adminAccountList.querySelectorAll("[data-admin-pin-reset-id]").forEach((button) => {
      button.addEventListener("click", () => resetAdminPin(button.dataset.adminPinResetId));
    });

    dom.adminAccountList.querySelectorAll("[data-admin-delete-id]").forEach((button) => {
      button.addEventListener("click", () => deleteAdmin(button.dataset.adminDeleteId));
    });
  }

  function renderPublicContentForm() {
    const content = state.dashboard.publicContent;
    dom.tickerOne.value = content.ticker?.[0] || "";
    dom.tickerTwo.value = content.ticker?.[1] || "";
    dom.tickerThree.value = content.ticker?.[2] || "";
    dom.offerTitleInput.value = content.offer?.title || "";
    dom.offerAmountInput.value = content.offer?.amount || "";
    dom.offerRateInput.value = content.offer?.rate || "";
    dom.offerInstallmentInput.value = content.offer?.installment || "";
    dom.offerPayoutInput.value = content.offer?.payout || "";
    dom.offerMessageInput.value = content.offer?.message || "";
    dom.contactPhoneInput.value = content.contact?.phone || "";
    dom.contactWhatsappInput.value = content.contact?.whatsapp || "";
    dom.contactEmailInput.value = content.contact?.email || "";
  }

  function renderAudit() {
    const audit = state.dashboard.audit;
    const notifications = state.dashboard.notifications;

    dom.auditLogList.innerHTML = audit.length
      ? audit.map((item) => `
          <article class="activity-item">
            <div class="activity-top">
              <strong>${escapeHtml(item.actorName)}</strong>
              <span class="detail-label">${formatDateTime(item.createdAt)}</span>
            </div>
            <div>${escapeHtml(item.action)}</div>
            <div class="detail-label">${escapeHtml(item.targetType)} • ${escapeHtml(item.targetId)}</div>
          </article>
        `).join("")
      : `<div class="empty-block">No audit entries are available.</div>`;

    dom.superAuditNotificationFeed.innerHTML = notifications.length
      ? notifications.map((item) => `
          <article class="notification-item">
            <div class="notification-top">
              <strong>${escapeHtml(item.title)}</strong>
              <span class="detail-label">${formatDateTime(item.createdAt)}</span>
            </div>
            <div class="detail-subtext">${escapeHtml(item.message)}</div>
          </article>
        `).join("")
      : `<div class="empty-block">No super admin notifications yet.</div>`;
  }

  async function submitDecision(decision) {
    const applicationId = state.selectedApplicationId;
    if (!applicationId) {
      return;
    }

    const actionButton = getDecisionButton(decision);
    if (actionButton) {
      actionButton.disabled = true;
    }
    dom.decisionFeedback.textContent = "";

    try {
      await api(`/api/super-admin/applications/${applicationId}/decision`, {
        method: "POST",
        body: {
          decision,
          approvedAmount: Number(dom.decisionAmount.value || 0),
          interestRate: Number(dom.decisionRate.value || 0),
          installmentAmount: Number(dom.decisionInstallment.value || 0),
          termMonths: Number(dom.decisionTerm.value || 0),
          note: dom.decisionNote.value
        }
      });
      dom.decisionFeedback.textContent = `${applicationId} has been ${decision === "approve" ? "approved" : "rejected"}.`;
      await loadDashboard();
    } catch (error) {
      dom.decisionFeedback.textContent = error.message;
      if (actionButton) {
        actionButton.disabled = false;
      }
    }
  }

  async function createAdmin(event) {
    event.preventDefault();
    setFeedbackState(dom.adminCreateFeedback, "");
    const fullName = dom.newAdminName.value.trim();
    const username = dom.newAdminUsername.value.trim();
    const email = dom.newAdminEmail.value.trim();
    const phone = dom.newAdminPhone.value.trim();
    const pin = dom.newAdminPin.value.trim();

    if (!fullName) {
      setFeedbackState(dom.adminCreateFeedback, "Enter the admin's full name.", true);
      dom.newAdminName.focus();
      return;
    }

    if (!username) {
      setFeedbackState(dom.adminCreateFeedback, "Enter a username for this admin.", true);
      dom.newAdminUsername.focus();
      return;
    }

    if (!/^\d{6}$/.test(pin)) {
      setFeedbackState(dom.adminCreateFeedback, "Enter a 6-digit numeric PIN.", true);
      dom.newAdminPin.focus();
      return;
    }

    try {
      await api("/api/super-admin/admins", {
        method: "POST",
        body: {
          fullName,
          username,
          email,
          phone,
          pin
        }
      });
      dom.createAdminForm.reset();
      setFeedbackState(dom.adminCreateFeedback, "Admin account created successfully.");
      await loadDashboard();
    } catch (error) {
      setFeedbackState(dom.adminCreateFeedback, error.message, true);
    }
  }

  async function updateAdminStatus(adminId, status) {
    try {
      await api(`/api/super-admin/admins/${adminId}`, {
        method: "PATCH",
        body: { status }
      });
      await loadDashboard();
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function resetAdminPin(adminId) {
    const input = dom.adminAccountList.querySelector(`[data-admin-pin-input-id="${adminId}"]`);
    const feedback = dom.adminAccountList.querySelector(`[data-admin-pin-feedback-id="${adminId}"]`);
    const pin = input?.value.trim() || "";

    if (!/^\d{6}$/.test(pin)) {
      setFeedbackState(feedback, "Enter a new 6-digit numeric PIN for this admin.", true);
      input?.focus();
      return;
    }

    try {
      await api(`/api/super-admin/admins/${adminId}/pin`, {
        method: "PATCH",
        body: { pin }
      });
      if (input) {
        input.value = "";
      }
      setFeedbackState(feedback, "Admin PIN updated. The admin must sign in again with the new PIN.");
    } catch (error) {
      setFeedbackState(feedback, error.message, true);
    }
  }

  async function deleteAdmin(adminId) {
    if (!window.confirm("Delete this admin account permanently?")) {
      return;
    }
    try {
      await api(`/api/super-admin/admins/${adminId}`, { method: "DELETE" });
      await loadDashboard();
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function publishContent(event) {
    event.preventDefault();
    dom.publicContentFeedback.textContent = "";

    try {
      await api("/api/super-admin/public-content", {
        method: "PATCH",
        body: {
          ticker: [dom.tickerOne.value, dom.tickerTwo.value, dom.tickerThree.value],
          offer: {
            title: dom.offerTitleInput.value,
            amount: Number(dom.offerAmountInput.value || 0),
            rate: Number(dom.offerRateInput.value || 0),
            installment: Number(dom.offerInstallmentInput.value || 0),
            payout: dom.offerPayoutInput.value,
            message: dom.offerMessageInput.value
          },
          contact: {
            phone: dom.contactPhoneInput.value,
            whatsapp: dom.contactWhatsappInput.value,
            email: dom.contactEmailInput.value
          }
        }
      });
      dom.publicContentFeedback.textContent = "Borrower-facing content published live.";
      await loadDashboard();
    } catch (error) {
      dom.publicContentFeedback.textContent = error.message;
    }
  }

  async function sendAnnouncement(event) {
    event.preventDefault();
    dom.announcementFeedback.textContent = "";

    try {
      await api("/api/super-admin/announcements", {
        method: "POST",
        body: {
          title: dom.announcementTitle.value,
          targetRole: dom.announcementTarget.value,
          message: dom.announcementMessage.value
        }
      });
      dom.announcementForm.reset();
      dom.announcementFeedback.textContent = "Announcement delivered.";
      await loadDashboard();
    } catch (error) {
      dom.announcementFeedback.textContent = error.message;
    }
  }

  async function logout() {
    await api("/api/super-admin/logout", { method: "POST" });
    window.location.href = "super-admin-login.html";
  }

  function setView(view) {
    state.currentView = view;
    Object.entries(dom.views).forEach(([name, element]) => {
      element.classList.toggle("active", name === view);
    });
    dom.viewButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.superView === view);
    });
  }

  function decisionCard(item, selected) {
    return `
      <article class="application-item ${selected ? "is-selected" : ""}" data-decision-id="${escapeHtml(item.id)}">
        <div class="item-top">
          <strong>${escapeHtml(item.id)}</strong>
          <span class="badge ${escapeHtml(item.status)}">${humanize(item.status)}</span>
        </div>
        <div class="detail-label">${escapeHtml(item.borrower?.fullName || "Unknown borrower")}</div>
        <div class="detail-label">${formatCurrency(item.amountRequested)} requested • ${item.termMonths} months</div>
        <div class="detail-label">Admin note: ${escapeHtml(item.adminNote || "None")}</div>
      </article>
    `;
  }

  async function api(path, options = {}) {
    return shared.request(path, options);
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      maximumFractionDigits: 0
    }).format(Number(value || 0));
  }

  function formatDate(value) {
    return value ? new Intl.DateTimeFormat("en-UG", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "Not available";
  }

  function formatDateTime(value) {
    return value ? new Intl.DateTimeFormat("en-UG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "Not available";
  }

  function humanize(value) {
    return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toCamel(value) {
    return String(value).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  function setFeedbackState(element, message, isError = false) {
    if (!element) {
      return;
    }

    element.textContent = message;
    element.classList.toggle("portal-error", isError);
    element.classList.toggle("portal-success", !isError);
  }
})();
