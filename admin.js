(function adminWorkspace() {
  const shared = window.CraneShared;
  const state = {
    dashboard: null,
    currentView: "overview",
    selectedApplicationId: null,
    selectedBorrowerId: null,
    selectedThreadBorrowerId: null
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
      "admin-name-display", "metric-pending", "metric-review", "metric-awaiting", "metric-borrowers", "metric-support",
      "overview-application-feed", "overview-notification-feed", "overview-activity-feed", "admin-application-list",
      "admin-application-detail", "review-amount", "review-rate", "review-installment", "review-payout", "review-note",
      "review-feedback", "action-under-review", "action-needs-docs", "action-send-super", "action-reject", "borrower-list",
      "borrower-detail", "support-thread-list", "support-thread-title", "support-thread-subtitle", "support-message-list",
      "support-reply-form", "support-reply-input", "support-feedback", "admin-logout-btn", "admin-header-brand-btn",
      "admin-quick-view-btn", "admin-notification-btn", "admin-notification-badge", "admin-notification-panel",
      "admin-close-notifications", "admin-notification-list"
    ];

    ids.forEach((id) => {
      dom[toCamel(id)] = document.getElementById(id);
    });

    dom.headerButtons = [...document.querySelectorAll("[data-admin-view]")];
    dom.views = {
      overview: document.getElementById("admin-overview-view"),
      applications: document.getElementById("admin-applications-view"),
      borrowers: document.getElementById("admin-borrowers-view"),
      support: document.getElementById("admin-support-view")
    };
  }

  function bindViewButtons() {
    dom.headerButtons.forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.adminView));
    });
  }

  function bindActions() {
    dom.actionUnderReview?.addEventListener("click", () => submitReview("under_review"));
    dom.actionNeedsDocs?.addEventListener("click", () => submitReview("needs_documents"));
    dom.actionSendSuper?.addEventListener("click", () => submitReview("awaiting_super_admin"));
    dom.actionReject?.addEventListener("click", () => submitReview("rejected_by_admin"));
    dom.supportReplyForm?.addEventListener("submit", submitSupportReply);
    dom.adminLogoutBtn?.addEventListener("click", logout);
    dom.adminHeaderBrandBtn?.addEventListener("click", () => setView("overview"));
    dom.adminQuickViewBtn?.addEventListener("click", () => setView("support"));
    dom.adminNotificationBtn?.addEventListener("click", () => {
      dom.adminNotificationPanel?.classList.add("active");
    });
    dom.adminCloseNotifications?.addEventListener("click", () => {
      dom.adminNotificationPanel?.classList.remove("active");
    });
  }

  async function loadDashboard() {
    try {
      const data = await api("/api/admin/dashboard");
      state.dashboard = data;
      dom.adminNameDisplay.textContent = data.admin.fullName;
      if (!state.selectedApplicationId && data.applications.length) {
        state.selectedApplicationId = data.applications[0].id;
      }
      if (!state.selectedBorrowerId && data.borrowers.length) {
        state.selectedBorrowerId = String(data.borrowers[0].id);
      }
      if (!state.selectedThreadBorrowerId && data.supportThreads.length) {
        state.selectedThreadBorrowerId = String(data.supportThreads[0].borrower.id);
      }
      render();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.href = "admin-login.html";
        return;
      }
      console.error(error);
    }
  }

  function connectEvents() {
    shared.connectEvents(() => loadDashboard());
  }

  function render() {
    renderMetrics();
    renderOverview();
    renderApplications();
    renderBorrowers();
    renderSupport();
    renderNotifications();
    setView(state.currentView);
  }

  function renderNotifications() {
    const notifications = state.dashboard.notifications || [];
    dom.adminNotificationBadge.textContent = String(notifications.length);
    dom.adminNotificationList.innerHTML = notifications.length
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
    dom.metricPending.textContent = metrics.pendingApplications;
    dom.metricReview.textContent = metrics.inReview;
    dom.metricAwaiting.textContent = metrics.awaitingSuperAdmin;
    dom.metricBorrowers.textContent = metrics.activeBorrowers;
    dom.metricSupport.textContent = metrics.supportThreads;
  }

  function renderOverview() {
    const topApplications = state.dashboard.applications.slice(0, 6);
    const notifications = state.dashboard.notifications.slice(0, 8);
    const activity = state.dashboard.activity.slice(0, 10);

    dom.overviewApplicationFeed.innerHTML = topApplications.length
      ? topApplications.map((item) => applicationCard(item)).join("")
      : `<div class="empty-block">No applications have been submitted yet.</div>`;

    dom.overviewNotificationFeed.innerHTML = notifications.length
      ? notifications.map((item) => `
          <article class="notification-item">
            <div class="notification-top">
              <strong>${escapeHtml(item.title)}</strong>
              <span class="detail-label">${formatDateTime(item.createdAt)}</span>
            </div>
            <div class="detail-subtext">${escapeHtml(item.message)}</div>
          </article>
        `).join("")
      : `<div class="empty-block">No admin notifications yet.</div>`;

    dom.overviewActivityFeed.innerHTML = activity.length
      ? activity.map((item) => `
          <article class="activity-item">
            <div class="activity-top">
              <strong>${escapeHtml(item.actorName)}</strong>
              <span class="detail-label">${formatDateTime(item.createdAt)}</span>
            </div>
            <div>${escapeHtml(item.action)}</div>
            <div class="detail-label">${escapeHtml(item.targetType)} • ${escapeHtml(item.targetId)}</div>
          </article>
        `).join("")
      : `<div class="empty-block">No activity logged yet.</div>`;
  }

  function renderApplications() {
    const applications = state.dashboard.applications;
    const selected = applications.find((item) => item.id === state.selectedApplicationId) || applications[0] || null;
    if (selected && state.selectedApplicationId !== selected.id) {
      state.selectedApplicationId = selected.id;
    }

    dom.adminApplicationList.innerHTML = applications.length
      ? applications.map((item) => applicationCard(item, item.id === state.selectedApplicationId)).join("")
      : `<div class="empty-block">No applications are available for review.</div>`;

    dom.adminApplicationList.querySelectorAll("[data-application-id]").forEach((element) => {
      element.addEventListener("click", () => {
        state.selectedApplicationId = element.dataset.applicationId;
        renderApplications();
      });
    });

    if (!selected) {
      dom.adminApplicationDetail.innerHTML = `<div class="detail-panel-empty">Select an application to view borrower details, documents, and review actions.</div>`;
      return;
    }

    dom.reviewAmount.value = selected.recommendedAmount || selected.amountRequested;
    dom.reviewRate.value = selected.recommendedRate || 1.8;
    dom.reviewInstallment.value = selected.recommendedInstallment || "";
    dom.reviewPayout.value = selected.payoutEta || "Same day";
    dom.reviewNote.value = selected.adminNote || "";

    dom.adminApplicationDetail.innerHTML = `
      <div class="detail-grid">
        <div><span>Application</span><strong>${escapeHtml(selected.id)}</strong></div>
        <div><span>Status</span><strong>${humanize(selected.status)}</strong></div>
        <div><span>Borrower</span><strong>${escapeHtml(selected.borrower?.fullName || "Unknown")}</strong></div>
        <div><span>Phone</span><strong>${escapeHtml(selected.borrower?.phone || "Not provided")}</strong></div>
        <div><span>Amount requested</span><strong>${formatCurrency(selected.amountRequested)}</strong></div>
        <div><span>Preferred term</span><strong>${selected.termMonths} months</strong></div>
      </div>
      <div class="detail-grid">
        <div><span>Purpose</span><strong>${humanize(selected.purpose)}</strong></div>
        <div><span>Borrower category</span><strong>${humanize(selected.applicant.category || "Not set")}</strong></div>
        <div><span>District</span><strong>${humanize(selected.applicant.district || "Not set")}</strong></div>
        <div><span>Subcounty</span><strong>${humanize(selected.applicant.subcounty || "Not set")}</strong></div>
        <div><span>Monthly income</span><strong>${formatCurrency(selected.employment.monthlyIncome || 0)}</strong></div>
        <div><span>Other income</span><strong>${formatCurrency(selected.employment.otherIncome || 0)}</strong></div>
      </div>
      <div class="detail-panel-empty">
        <strong>Applicant note</strong>
        <div class="detail-subtext">${escapeHtml(selected.employment.existingObligations || "No additional obligations recorded.")}</div>
      </div>
      <div class="detail-stack">
        <strong>Uploaded documents</strong>
        <div class="document-grid">
          ${selected.documents.length
            ? selected.documents.map((doc) => `
                <figure class="document-tile">
                  <img src="${doc.url}" alt="${escapeHtml(doc.label)}">
                  <figcaption>${escapeHtml(doc.label)}</figcaption>
                </figure>
              `).join("")
            : `<div class="detail-panel-empty">No documents uploaded.</div>`}
        </div>
      </div>
    `;
  }

  function renderBorrowers() {
    const borrowers = state.dashboard.borrowers;
    const selected = borrowers.find((item) => String(item.id) === state.selectedBorrowerId) || borrowers[0] || null;
    if (selected && String(selected.id) !== state.selectedBorrowerId) {
      state.selectedBorrowerId = String(selected.id);
    }

    dom.borrowerList.innerHTML = borrowers.length
      ? borrowers.map((item) => `
          <article class="borrower-item ${String(item.id) === state.selectedBorrowerId ? "is-selected" : ""}" data-borrower-id="${item.id}">
            <div class="item-top">
              <strong>${escapeHtml(item.fullName)}</strong>
              <span class="badge ${escapeHtml(item.accountStatus)}">${humanize(item.accountStatus)}</span>
            </div>
            <div class="detail-label">${escapeHtml(item.phone)}</div>
            <div class="detail-label">Score: ${item.latestScore.current || "N/A"} • Loans: ${item.loanSummary.length}</div>
          </article>
        `).join("")
      : `<div class="empty-block">No borrower accounts exist yet.</div>`;

    dom.borrowerList.querySelectorAll("[data-borrower-id]").forEach((element) => {
      element.addEventListener("click", () => {
        state.selectedBorrowerId = element.dataset.borrowerId;
        renderBorrowers();
      });
    });

    if (!selected) {
      dom.borrowerDetail.innerHTML = `<div class="detail-panel-empty">Select a borrower to inspect their account and active loans.</div>`;
      return;
    }

    dom.borrowerDetail.innerHTML = `
      <div class="detail-grid">
        <div><span>Name</span><strong>${escapeHtml(selected.fullName)}</strong></div>
        <div><span>Phone</span><strong>${escapeHtml(selected.phone)}</strong></div>
        <div><span>Email</span><strong>${escapeHtml(selected.email || "Not provided")}</strong></div>
        <div><span>Member since</span><strong>${formatDate(selected.memberSince)}</strong></div>
        <div><span>Account status</span><strong>${humanize(selected.accountStatus)}</strong></div>
        <div><span>Credit score</span><strong>${selected.latestScore.current || "N/A"} (${escapeHtml(selected.latestScore.grade || "No score")})</strong></div>
      </div>
      <div class="detail-stack">
        <strong>Active loans</strong>
        ${selected.loanSummary.length
          ? selected.loanSummary.map((loan) => `
              <article class="application-item">
                <div class="item-top">
                  <strong>${escapeHtml(loan.id)}</strong>
                  <span class="badge ${escapeHtml(loan.status)}">${humanize(loan.status)}</span>
                </div>
                <div class="detail-label">Outstanding ${formatCurrency(loan.outstandingAmount)} • Due ${formatDate(loan.nextDueDate)}</div>
              </article>
            `).join("")
          : `<div class="empty-block">No approved loans are attached to this borrower yet.</div>`}
      </div>
      <div class="detail-stack">
        <strong>Reset borrower PIN</strong>
        <div class="detail-subtext">Set a new 6-digit PIN for the customer's next sign-in.</div>
        <div class="portal-field">
          <label for="borrower-pin-reset-${selected.id}">New borrower PIN</label>
          <input id="borrower-pin-reset-${selected.id}" class="portal-input" type="password" maxlength="6" inputmode="numeric" pattern="[0-9]{6}" placeholder="Enter new 6-digit PIN" data-borrower-pin-input-id="${selected.id}">
        </div>
        <div class="button-row">
          <button type="button" class="chip-btn" data-borrower-pin-reset-id="${selected.id}">Update Borrower PIN</button>
        </div>
        <div class="portal-success" data-borrower-pin-feedback-id="${selected.id}"></div>
      </div>
    `;

    dom.borrowerDetail.querySelector(`[data-borrower-pin-reset-id="${selected.id}"]`)?.addEventListener("click", () => {
      resetBorrowerPin(selected.id);
    });
  }

  function renderSupport() {
    const threads = state.dashboard.supportThreads;
    const selected = threads.find((item) => String(item.borrower.id) === state.selectedThreadBorrowerId) || threads[0] || null;
    if (selected && String(selected.borrower.id) !== state.selectedThreadBorrowerId) {
      state.selectedThreadBorrowerId = String(selected.borrower.id);
    }

    dom.supportThreadList.innerHTML = threads.length
      ? threads.map((thread) => `
          <article class="thread-item ${String(thread.borrower.id) === state.selectedThreadBorrowerId ? "is-selected" : ""}" data-thread-borrower-id="${thread.borrower.id}">
            <div class="item-top">
              <strong>${escapeHtml(thread.borrower.fullName)}</strong>
              <span class="badge info">${thread.messages.length} messages</span>
            </div>
            <div class="detail-label">${escapeHtml(thread.borrower.phone)}</div>
            <div class="detail-label">${escapeHtml(thread.messages.at(-1)?.message || "")}</div>
          </article>
        `).join("")
      : `<div class="empty-block">Borrower support messages will appear here.</div>`;

    dom.supportThreadList.querySelectorAll("[data-thread-borrower-id]").forEach((element) => {
      element.addEventListener("click", () => {
        state.selectedThreadBorrowerId = element.dataset.threadBorrowerId;
        renderSupport();
      });
    });

    if (!selected) {
      dom.supportThreadTitle.textContent = "Support conversation";
      dom.supportThreadSubtitle.textContent = "Select a thread to view borrower messages and reply.";
      dom.supportMessageList.innerHTML = `<div class="detail-panel-empty">No thread selected.</div>`;
      return;
    }

    dom.supportThreadTitle.textContent = selected.borrower.fullName;
    dom.supportThreadSubtitle.textContent = `${selected.borrower.phone} • reply as the admin operations team`;
    dom.supportMessageList.innerHTML = selected.messages.map((message) => `
      <article class="message-bubble ${escapeHtml(message.senderRole)}">
        <strong>${humanize(message.senderRole)}</strong>
        <div>${escapeHtml(message.message)}</div>
        <div class="detail-label">${formatDateTime(message.createdAt)}</div>
      </article>
    `).join("");
  }

  async function submitReview(status) {
    const applicationId = state.selectedApplicationId;
    if (!applicationId) {
      return;
    }

    dom.reviewFeedback.textContent = "";

    try {
      await api(`/api/admin/applications/${applicationId}/review`, {
        method: "POST",
        body: {
          status,
          note: dom.reviewNote.value,
          recommendedAmount: Number(dom.reviewAmount.value || 0),
          recommendedRate: Number(dom.reviewRate.value || 0),
          recommendedInstallment: Number(dom.reviewInstallment.value || 0),
          payoutEta: dom.reviewPayout.value
        }
      });
      dom.reviewFeedback.textContent = `Application ${applicationId} updated to ${humanize(status)}.`;
      await loadDashboard();
    } catch (error) {
      dom.reviewFeedback.textContent = error.message;
    }
  }

  async function submitSupportReply(event) {
    event.preventDefault();
    if (!state.selectedThreadBorrowerId) {
      return;
    }

    dom.supportFeedback.textContent = "";

    try {
      await api("/api/admin/support/reply", {
        method: "POST",
        body: {
          borrowerId: Number(state.selectedThreadBorrowerId),
          message: dom.supportReplyInput.value
        }
      });
      dom.supportReplyInput.value = "";
      dom.supportFeedback.textContent = "Reply sent to borrower.";
      await loadDashboard();
    } catch (error) {
      dom.supportFeedback.textContent = error.message;
    }
  }

  async function resetBorrowerPin(borrowerId) {
    const input = dom.borrowerDetail.querySelector(`[data-borrower-pin-input-id="${borrowerId}"]`);
    const feedback = dom.borrowerDetail.querySelector(`[data-borrower-pin-feedback-id="${borrowerId}"]`);
    const pin = input?.value.trim() || "";

    if (!/^\d{6}$/.test(pin)) {
      setFeedbackState(feedback, "Enter a new 6-digit numeric PIN for this borrower.", true);
      input?.focus();
      return;
    }

    try {
      await api(`/api/admin/borrowers/${borrowerId}/pin`, {
        method: "PATCH",
        body: { pin }
      });
      if (input) {
        input.value = "";
      }
      setFeedbackState(feedback, "Borrower PIN updated. The customer must sign in again with the new PIN.");
    } catch (error) {
      setFeedbackState(feedback, error.message, true);
    }
  }

  async function logout() {
    await api("/api/admin/logout", { method: "POST" });
    window.location.href = "admin-login.html";
  }

  function setView(view) {
    state.currentView = view;
    Object.entries(dom.views).forEach(([name, element]) => {
      element.classList.toggle("active", name === view);
    });
    dom.headerButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.adminView === view);
    });
  }

  function applicationCard(item, selected) {
    return `
      <article class="application-item ${selected ? "is-selected" : ""}" data-application-id="${escapeHtml(item.id)}">
        <div class="item-top">
          <strong>${escapeHtml(item.id)}</strong>
          <span class="badge ${escapeHtml(item.status)}">${humanize(item.status)}</span>
        </div>
        <div class="detail-label">${escapeHtml(item.borrower?.fullName || "Unknown borrower")}</div>
        <div class="detail-label">${formatCurrency(item.amountRequested)} • ${item.termMonths} months</div>
        <div class="detail-label">${humanize(item.purpose)}</div>
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

  function setFeedbackState(element, message, isError = false) {
    if (!element) {
      return;
    }

    element.textContent = message;
    element.classList.toggle("portal-error", isError);
    element.classList.toggle("portal-success", !isError);
  }

  function toCamel(value) {
    return String(value).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }
})();
