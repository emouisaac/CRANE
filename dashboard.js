(function initializeBorrowerDashboard() {
  const shared = window.CraneShared;
  const state = {
    bootstrap: null,
    currentView: "overview",
    currentLoanFilter: "all",
    selectedLoanId: null,
    paymentChannel: "MTN Mobile Money",
    eventSource: null
  };

  const districtMap = {
    kampala: ["Central", "Kawempe", "Makindye", "Nakawa", "Rubaga"],
    wakiso: ["Entebbe", "Kira", "Nansana", "Kasangati", "Katabi"],
    mukono: ["Goma", "Mukono Central", "Nakifuma", "Seeta"],
    entebbe: ["Division A", "Division B", "Katabi"],
    masaka: ["Nyendo", "Kimaanya", "Buwunga"],
    mbarara: ["Kakoba", "Nyamitanga", "Nyakayojo"],
    fort_portal: ["West", "East", "South Division"],
    jinja: ["Mpumudde", "Bugembe", "Walukuba"],
    soroti: ["Western", "Eastern", "Northern"],
    lira: ["Lira City East", "Lira City West", "Adekokwok"],
    gulu: ["Pece", "Bardege", "Layibi"],
    arua: ["Central", "River Oli", "Ayivu"],
    other: ["Custom location"]
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", () => {
    cacheDom();
    initializeIntro();
    bindNavigation();
    bindPanels();
    bindForms();
    populateSubcounties(dom.applicantDistrict.value || "kampala");
    toggleEmploymentFields();
    refreshDashboard();
    state.eventSource = shared.connectEvents(() => refreshDashboard({ quiet: true }));
  });

  function cacheDom() {
    const ids = [
      "site-intro", "header-brand-btn", "contact-us-link", "desktop-login-btn", "mobile-login-btn", "mobile-search-toggle",
      "notification-btn", "sidebar-overlay", "dashboard-sidebar", "mobile-contact-us-btn", "overview-view", "user-name",
      "refresh-dashboard", "section-wave-canvas", "loan-balance-amount", "ticker-content", "offer-title", "offer-amount",
      "offer-rate", "offer-installment", "offer-payout", "offer-message", "apply-offer-btn", "stat-approved", "stat-approval",
      "stat-repeat", "snapshot-title", "snapshot-message", "snapshot-badge", "snapshot-active-loans", "snapshot-outstanding-balance",
      "snapshot-next-due", "snapshot-unread-alerts", "loans-list", "loans-detail-list", "loan-select", "partial-amount-group",
      "partial-amount", "payment-installment-due", "payment-service-fee", "payment-total-today", "early-outstanding-principal",
      "early-payoff-benefit", "early-total-payoff", "early-repay-btn", "autodebit-day", "autodebit-account", "autodebit-agree",
      "setup-autodebit", "credit-score-display", "credit-score-grade", "score-drivers-list", "score-history-chart",
      "loan-request-form", "applicant-name", "applicant-phone", "applicant-email", "applicant-id-number", "applicant-dob",
      "applicant-district", "applicant-subcounty", "applicant-village", "applicant-category", "loan-amount", "loan-term",
      "loan-purpose", "employer-name", "position-title", "employment-tenure", "business-name", "business-type",
      "business-registration", "monthly-income", "other-income", "existing-obligations", "id-front", "id-back", "income-proof",
      "bank-statement", "selfie-photo", "additional-documents", "loan-request-feedback", "referral-code", "copy-referral-code",
      "referral-link", "referrals-table-body", "contact-modal-overlay", "contact-modal-close", "call-now-btn", "call-number",
      "whatsapp-btn", "whatsapp-number", "email-btn", "email-address", "mobile-menu-toggle", "footer-money-btn", "home-nav-btn",
      "footer-chat-btn", "footer-profile-btn", "notification-panel", "close-notifications", "notifications-list", "payment-modal",
      "close-payment-modal", "confirm-amount", "confirm-method", "cancel-payment", "confirm-payment-btn", "profile-panel",
      "close-profile", "profile-initials", "profile-name", "profile-status-badge", "profile-phone", "profile-last-login",
      "profile-customer-id", "profile-member-since", "profile-credit-score", "profile-phone-info", "profile-email",
      "profile-account-status", "profile-last-login-info", "change-pin-btn", "security-settings-btn", "notification-prefs-btn",
      "help-btn", "terms-btn", "profile-logout-btn", "login-modal", "login-modal-close", "login-form", "login-country",
      "login-phone", "login-phone-error", "login-pin", "login-pin-error", "login-submit-btn", "forgot-pin-link",
      "switch-to-register", "register-form", "register-full-name", "register-name-error", "register-country", "register-phone",
      "register-phone-error", "register-email", "register-email-error", "register-pin", "register-pin-error",
      "register-pin-confirm", "register-pin-confirm-error", "register-submit-btn", "switch-to-login", "chat-container",
      "chat-close-btn", "chat-messages", "chat-input", "chat-send-btn", "view-loan-options", "view-all-loans"
    ];

    ids.forEach((id) => {
      dom[toCamel(id)] = document.getElementById(id);
    });

    dom.navLinks = [...document.querySelectorAll(".nav-link[data-view]")];
    dom.menuItems = [...document.querySelectorAll(".menu-item[data-view]")];
    dom.viewSections = [...document.querySelectorAll(".view-section")];
    dom.quickBoxes = [...document.querySelectorAll("[data-quick-box]")];
    dom.statusPills = [...document.querySelectorAll(".status-pill")];
    dom.paymentMethodButtons = [...document.querySelectorAll(".payment-method")];
    dom.paymentTypeInputs = [...document.querySelectorAll("input[name='payment-type']")];
    dom.passwordToggles = [...document.querySelectorAll(".password-toggle")];
    dom.sectionOffer = document.getElementById("active-offer");
    dom.scoreFill = document.querySelector(".score-fill");
  }

  function initializeIntro() {
    document.body.classList.add("intro-playing");
    window.setTimeout(() => {
      dom.siteIntro?.classList.add("is-hidden");
      document.body.classList.remove("intro-loading", "intro-playing");
      document.body.classList.add("intro-complete");
      drawHeaderWave();
    }, 1300);
  }

  function bindNavigation() {
    dom.navLinks.forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        activateView(link.dataset.view);
      });
    });

    dom.menuItems.forEach((item) => {
      item.addEventListener("click", (event) => {
        event.preventDefault();
        activateView(item.dataset.view);
        closeMobileMenu();
      });
    });

    dom.quickBoxes.forEach((button) => {
      button.addEventListener("click", () => {
        const quickTarget = button.dataset.quickBox;
        if (quickTarget === "repay") {
          activateView("repay");
          return;
        }

        activateView("loans");
        state.currentLoanFilter = quickTarget === "active" || quickTarget === "overdue" ? quickTarget : "all";
        renderLoanCollections();
      });
    });

    dom.statusPills.forEach((pill) => {
      pill.addEventListener("click", () => {
        state.currentLoanFilter = pill.dataset.status;
        renderLoanCollections();
      });
    });

    dom.homeNavBtn?.addEventListener("click", () => activateView("overview"));
    dom.footerMoneyBtn?.addEventListener("click", () => activateView("loans"));
    dom.viewAllLoans?.addEventListener("click", () => activateView("loans"));
    dom.viewLoanOptions?.addEventListener("click", () => activateView("loans"));
    dom.applyOfferBtn?.addEventListener("click", () => {
      const offer = state.bootstrap?.auth?.borrower?.offerMatch || state.bootstrap?.marketing?.offer;
      if (offer?.amount) {
        dom.loanAmount.value = offer.amount;
      }
      activateView("get-loan");
    });

    dom.headerBrandBtn?.addEventListener("click", () => activateView("overview"));
    dom.mobileMenuToggle?.addEventListener("click", openMobileMenu);
    dom.sidebarOverlay?.addEventListener("click", closeMobileMenu);
    dom.mobileSearchToggle?.addEventListener("click", () => activateView("get-loan"));
  }

  function bindPanels() {
    dom.contactUsLink?.addEventListener("click", (event) => {
      event.preventDefault();
      openContactModal();
    });
    dom.mobileContactUsBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      openContactModal();
      closeMobileMenu();
    });
    dom.contactModalClose?.addEventListener("click", closeContactModal);
    dom.contactModalOverlay?.addEventListener("click", (event) => {
      if (event.target === dom.contactModalOverlay) {
        closeContactModal();
      }
    });

    dom.desktopLoginBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      handleLoginEntry();
    });
    dom.mobileLoginBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      handleLoginEntry();
      closeMobileMenu();
    });
    dom.loginModalClose?.addEventListener("click", closeLoginModal);
    dom.loginModal?.addEventListener("click", (event) => {
      if (event.target === dom.loginModal) {
        closeLoginModal();
      }
    });

    dom.notificationBtn?.addEventListener("click", async () => {
      dom.notificationPanel?.classList.add("active");
      if (state.bootstrap?.auth?.loggedIn) {
        try {
          await shared.request("/api/borrower/notifications/read", { method: "POST" });
        } catch (error) {
          console.warn(error);
        }
      }
    });
    dom.closeNotifications?.addEventListener("click", () => dom.notificationPanel?.classList.remove("active"));

    dom.footerChatBtn?.addEventListener("click", () => dom.chatContainer?.classList.add("active"));
    dom.chatCloseBtn?.addEventListener("click", () => dom.chatContainer?.classList.remove("active"));

    dom.footerProfileBtn?.addEventListener("click", () => {
      if (state.bootstrap?.auth?.loggedIn) {
        dom.profilePanel?.classList.add("active");
      } else {
        openLoginModal();
      }
    });
    dom.closeProfile?.addEventListener("click", () => dom.profilePanel?.classList.remove("active"));

    dom.closePaymentModal?.addEventListener("click", closePaymentModal);
    dom.cancelPayment?.addEventListener("click", closePaymentModal);
    dom.paymentModal?.addEventListener("click", (event) => {
      if (event.target === dom.paymentModal) {
        closePaymentModal();
      }
    });

    dom.callNowBtn?.addEventListener("click", () => {
      window.location.href = `tel:${(dom.callNumber.textContent || "").replace(/\s+/g, "")}`;
    });
    dom.whatsappBtn?.addEventListener("click", () => {
      const raw = (dom.whatsappNumber.textContent || "").replace(/[^\d]/g, "");
      window.open(`https://wa.me/${raw}`, "_blank");
    });
    dom.emailBtn?.addEventListener("click", () => {
      window.location.href = `mailto:${dom.emailAddress.textContent || ""}`;
    });

    dom.changePinBtn?.addEventListener("click", () => focusSupportWithMessage("I need help changing my PIN."));
    dom.securitySettingsBtn?.addEventListener("click", () => focusSupportWithMessage("I need help with account security settings."));
    dom.notificationPrefsBtn?.addEventListener("click", () => activateView("overview"));
    dom.helpBtn?.addEventListener("click", () => dom.chatContainer?.classList.add("active"));
    dom.termsBtn?.addEventListener("click", () => window.location.href = "terms.html");
  }

  function bindForms() {
    dom.passwordToggles.forEach((button) => {
      button.addEventListener("click", () => {
        const target = document.getElementById(button.dataset.target);
        if (!target) {
          return;
        }
        const reveal = target.type === "password";
        target.type = reveal ? "text" : "password";
        button.textContent = reveal ? "Hide" : "Show";
      });
    });

    dom.switchToRegister?.addEventListener("click", () => toggleAuthMode("register"));
    dom.switchToLogin?.addEventListener("click", () => toggleAuthMode("login"));
    dom.forgotPinLink?.addEventListener("click", () => focusSupportWithMessage("I forgot my PIN and need help recovering access."));

    dom.loginForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearAuthErrors();

      try {
        await shared.request("/api/auth/login", {
          method: "POST",
          body: {
            country: dom.loginCountry.value,
            phone: dom.loginPhone.value,
            pin: dom.loginPin.value
          }
        });

        closeLoginModal();
        await refreshDashboard();
      } catch (error) {
        dom.loginPinError.textContent = error.message;
      }
    });

    dom.registerForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearAuthErrors();

      if (dom.registerPin.value !== dom.registerPinConfirm.value) {
        dom.registerPinConfirmError.textContent = "PIN confirmation does not match.";
        return;
      }

      try {
        await shared.request("/api/auth/register", {
          method: "POST",
          body: {
            fullName: dom.registerFullName.value,
            country: dom.registerCountry.value,
            phone: dom.registerPhone.value,
            email: dom.registerEmail.value,
            pin: dom.registerPin.value
          }
        });

        closeLoginModal();
        await refreshDashboard();
      } catch (error) {
        dom.registerPhoneError.textContent = error.message;
      }
    });

    dom.applicantDistrict?.addEventListener("change", () => populateSubcounties(dom.applicantDistrict.value));
    dom.applicantCategory?.addEventListener("change", toggleEmploymentFields);

    dom.loanRequestForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!ensureBorrowerSession()) {
        return;
      }

      dom.loanRequestFeedback.textContent = "Uploading your application...";
      dom.loanRequestFeedback.className = "submission-feedback is-pending";

      try {
        const documents = await collectLoanDocuments();
        await shared.request("/api/borrower/loan-applications", {
          method: "POST",
          body: {
            fullName: dom.applicantName.value,
            phone: dom.applicantPhone.value,
            email: dom.applicantEmail.value,
            idNumber: dom.applicantIdNumber.value,
            dateOfBirth: dom.applicantDob.value,
            district: dom.applicantDistrict.value,
            subcounty: dom.applicantSubcounty.value,
            village: dom.applicantVillage.value,
            category: dom.applicantCategory.value,
            amountRequested: Number(dom.loanAmount.value),
            termMonths: Number(dom.loanTerm.value),
            purpose: dom.loanPurpose.value,
            employerName: dom.employerName.value,
            positionTitle: dom.positionTitle.value,
            employmentTenure: dom.employmentTenure.value,
            businessName: dom.businessName.value,
            businessType: dom.businessType.value,
            businessRegistration: dom.businessRegistration.value,
            monthlyIncome: Number(dom.monthlyIncome.value || 0),
            otherIncome: Number(dom.otherIncome.value || 0),
            existingObligations: dom.existingObligations.value,
            documents
          }
        });

        dom.loanRequestFeedback.textContent = "Your application was submitted. The admin team can now begin review.";
        dom.loanRequestFeedback.className = "submission-feedback is-success";
        dom.loanRequestForm.reset();
        populateSubcounties("kampala");
        await refreshDashboard();
      } catch (error) {
        dom.loanRequestFeedback.textContent = error.message;
        dom.loanRequestFeedback.className = "submission-feedback is-error";
      }
    });

    dom.paymentTypeInputs.forEach((input) => {
      input.addEventListener("change", updatePaymentSummary);
    });
    dom.partialAmount?.addEventListener("input", updatePaymentSummary);
    dom.loanSelect?.addEventListener("change", () => {
      state.selectedLoanId = dom.loanSelect.value;
      updatePaymentSummary();
    });

    dom.paymentMethodButtons.forEach((button) => {
      button.addEventListener("click", () => {
        dom.paymentMethodButtons.forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        state.paymentChannel = button.textContent.trim();
        updatePaymentSummary();
      });
    });
    dom.paymentTotalToday?.addEventListener("click", () => {
      if (getSelectedLoan()) {
        openPaymentModal();
      }
    });
    dom.paymentInstallmentDue?.addEventListener("click", () => {
      if (getSelectedLoan()) {
        openPaymentModal();
      }
    });

    dom.confirmPaymentBtn?.addEventListener("click", submitPayment);
    dom.earlyRepayBtn?.addEventListener("click", async () => {
      const selectedLoan = getSelectedLoan();
      if (!selectedLoan) {
        return;
      }
      dom.partialAmount.value = selectedLoan.outstandingAmount;
      const partialOption = dom.paymentTypeInputs.find((input) => input.value === "partial");
      partialOption.checked = true;
      updatePaymentSummary();
      openPaymentModal();
    });

    dom.setupAutodebit?.addEventListener("click", async () => {
      if (!ensureBorrowerSession()) {
        return;
      }
      if (!dom.autodebitAgree.checked) {
        window.alert("Confirm the auto-debit consent first.");
        return;
      }
      try {
        await shared.request("/api/borrower/autodebit", {
          method: "POST",
          body: {
            debitDay: dom.autodebitDay.value,
            sourceAccount: dom.autodebitAccount.value
          }
        });
        window.alert("Auto-debit preference saved.");
      } catch (error) {
        window.alert(error.message);
      }
    });

    dom.copyReferralCode?.addEventListener("click", async () => {
      const text = dom.referralLink.value || dom.referralCode.textContent;
      if (!text) {
        return;
      }
      await navigator.clipboard.writeText(text);
      dom.copyReferralCode.textContent = "Copied";
      window.setTimeout(() => {
        dom.copyReferralCode.textContent = "Copy";
      }, 1200);
    });

    dom.chatSendBtn?.addEventListener("click", submitChatMessage);
    dom.chatInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitChatMessage();
      }
    });

    dom.profileLogoutBtn?.addEventListener("click", async () => {
      await shared.request("/api/auth/logout", { method: "POST" });
      dom.profilePanel.classList.remove("active");
      await refreshDashboard();
    });
  }

  async function refreshDashboard(options = {}) {
    try {
      state.bootstrap = await shared.request("/api/public/bootstrap");
      renderAll();
    } catch (error) {
      state.bootstrap = null;
      renderAll();
      if (!options.quiet) {
        console.error(error);
      }
    }
  }

  function renderAll() {
    renderMarketing();
    renderAuthAwareSections();
    renderLoanCollections();
    updatePaymentSummary();
    renderScore();
    renderReferrals();
    renderNotifications();
    renderProfile();
    renderChat();
  }

  function renderMarketing() {
    const marketing = state.bootstrap?.marketing;
    if (!marketing) {
      return;
    }

    dom.tickerContent.innerHTML = marketing.ticker
      .map((item) => `<span class="ticker-item">${shared.escapeHtml(item)}</span>`)
      .join("");

    const offer = state.bootstrap?.auth?.borrower?.offerMatch || marketing.offer;
    dom.offerTitle.textContent = offer.title;
    dom.offerAmount.textContent = shared.formatCurrency(offer.amount);
    dom.offerRate.textContent = `${offer.rate}%/month`;
    dom.offerInstallment.textContent = shared.formatCurrency(offer.installment);
    dom.offerPayout.textContent = offer.payout;
    dom.offerMessage.textContent = offer.message;
    dom.statApproved.textContent = String(marketing.liveStats.approvedToday);
    dom.statApproval.textContent = `${marketing.liveStats.approvalRate}%`;
    dom.statRepeat.textContent = `${marketing.liveStats.repeatBorrowers}%`;
    dom.callNumber.textContent = marketing.contact.phone;
    dom.whatsappNumber.textContent = marketing.contact.whatsapp;
    dom.emailAddress.textContent = marketing.contact.email;
  }

  function renderAuthAwareSections() {
    const borrower = state.bootstrap?.auth?.borrower;
    const loggedIn = Boolean(state.bootstrap?.auth?.loggedIn && borrower);

    dom.userName.textContent = loggedIn ? borrower.profile.fullName.split(" ")[0] : "Member";
    dom.desktopLoginBtn.textContent = loggedIn ? "Account" : "Login";
    dom.mobileLoginBtn.querySelector("span").textContent = loggedIn ? "Account" : "Login";

    if (!loggedIn) {
      dom.loanBalanceAmount.textContent = shared.formatCurrency(0);
      dom.snapshotTitle.textContent = "No live account activity yet";
      dom.snapshotMessage.textContent = "Sign in to view current balances, due dates, and real account alerts.";
      dom.snapshotBadge.textContent = "Awaiting sign in";
      dom.snapshotActiveLoans.textContent = "0";
      dom.snapshotOutstandingBalance.textContent = shared.formatCurrency(0);
      dom.snapshotNextDue.textContent = "Not scheduled";
      dom.snapshotUnreadAlerts.textContent = "0";
      dom.copyReferralCode.disabled = true;
      dom.referralCode.textContent = "Unavailable";
      dom.referralLink.value = "";
      return;
    }

    const snapshot = borrower.snapshot;
    const loans = borrower.loans || [];
    dom.loanBalanceAmount.textContent = shared.formatCurrency(snapshot.outstandingBalance);
    dom.snapshotTitle.textContent = snapshot.title;
    dom.snapshotMessage.textContent = snapshot.message;
    dom.snapshotBadge.textContent = snapshot.badge;
    dom.snapshotActiveLoans.textContent = String(snapshot.activeLoans);
    dom.snapshotOutstandingBalance.textContent = shared.formatCurrency(snapshot.outstandingBalance);
    dom.snapshotNextDue.textContent = snapshot.nextDue ? shared.formatDate(snapshot.nextDue) : "Not scheduled";
    dom.snapshotUnreadAlerts.textContent = String(snapshot.unreadAlerts);
    dom.referralCode.textContent = borrower.referrals.code;
    dom.referralLink.value = borrower.referrals.link;
    dom.copyReferralCode.disabled = false;

    if (!state.selectedLoanId && loans.length) {
      state.selectedLoanId = loans[0].id;
    }

    prefillLoanFormFromBorrower(borrower.profile);
  }

  function prefillLoanFormFromBorrower(profile) {
    if (!profile) {
      return;
    }

    if (!dom.applicantName.value) {
      dom.applicantName.value = profile.fullName || "";
    }
    if (!dom.applicantPhone.value) {
      dom.applicantPhone.value = profile.phone || "";
    }
    if (!dom.applicantEmail.value) {
      dom.applicantEmail.value = profile.email || "";
    }
  }

  function renderLoanCollections() {
    const borrower = state.bootstrap?.auth?.borrower;
    const loans = borrower?.loans || [];
    const applications = borrower?.applications || [];
    const filtered = loans.filter((loan) => {
      if (state.currentLoanFilter === "all") {
        return true;
      }
      return loan.status === state.currentLoanFilter;
    });

    dom.statusPills.forEach((pill) => {
      pill.classList.toggle("active", pill.dataset.status === state.currentLoanFilter);
    });

    if (!loans.length && !applications.length) {
      const emptyState = `<div class="panel-empty-state">Your approved loans will appear here after the review team completes a request.</div>`;
      dom.loansList.innerHTML = emptyState;
      dom.loansDetailList.innerHTML = emptyState;
      renderPaymentLoanSelect([]);
      return;
    }

    dom.loansList.innerHTML = loans.length
      ? loans.map((loan) => `
          <article class="loan-card ${loan.id === state.selectedLoanId ? "is-selected" : ""}" data-loan-id="${shared.escapeHtml(loan.id)}">
            <div class="loan-card-top">
              <strong>${shared.escapeHtml(loan.id)}</strong>
              <span class="loan-status-badge ${shared.escapeHtml(loan.status)}">${shared.humanizeStatus(loan.status)}</span>
            </div>
            <div class="loan-card-amount">${shared.formatCurrency(loan.outstandingAmount)}</div>
            <p>Next due: ${shared.formatDate(loan.nextDueDate)}</p>
          </article>
        `).join("")
      : `<div class="panel-empty-state">No active loans yet. Submitted applications are still visible below.</div>`;

    dom.loansDetailList.innerHTML = filtered.length
      ? filtered.map((loan) => `
          <article class="loan-portfolio-item ${loan.id === state.selectedLoanId ? "is-selected" : ""}" data-loan-id="${shared.escapeHtml(loan.id)}">
            <div class="loan-portfolio-main">
              <div>
                <strong>${shared.escapeHtml(loan.id)}</strong>
                <p>${loan.termMonths} month facility at ${loan.interestRate}%/month</p>
              </div>
              <span class="loan-status-badge ${shared.escapeHtml(loan.status)}">${shared.humanizeStatus(loan.status)}</span>
            </div>
            <div class="loan-portfolio-grid">
              <div><span>Principal</span><strong>${shared.formatCurrency(loan.principalAmount)}</strong></div>
              <div><span>Total repayable</span><strong>${shared.formatCurrency(loan.totalRepayable)}</strong></div>
              <div><span>Installment</span><strong>${shared.formatCurrency(loan.installmentAmount)}</strong></div>
              <div><span>Outstanding</span><strong>${shared.formatCurrency(loan.outstandingAmount)}</strong></div>
            </div>
          </article>
        `).join("")
      : `<div class="panel-empty-state">No loans match the ${shared.escapeHtml(state.currentLoanFilter)} filter.</div>`;

    if (applications.length) {
      const applicationCards = applications.map((application) => `
        <article class="loan-portfolio-item pending-application-item">
          <div class="loan-portfolio-main">
            <div>
              <strong>${shared.escapeHtml(application.id)}</strong>
              <p>${shared.escapeHtml(application.purpose)} request for ${shared.formatCurrency(application.amountRequested)}</p>
            </div>
            <span class="loan-status-badge ${shared.escapeHtml(application.status)}">${shared.humanizeStatus(application.status)}</span>
          </div>
          <div class="loan-portfolio-grid">
            <div><span>Requested</span><strong>${shared.formatCurrency(application.amountRequested)}</strong></div>
            <div><span>Term</span><strong>${application.termMonths} months</strong></div>
            <div><span>Updated</span><strong>${shared.formatDate(application.updatedAt)}</strong></div>
            <div><span>Admin stage</span><strong>${shared.humanizeStatus(application.adminStage)}</strong></div>
          </div>
        </article>
      `).join("");

      dom.loansDetailList.insertAdjacentHTML("beforeend", applicationCards);
    }

    [...dom.loansList.querySelectorAll("[data-loan-id]"), ...dom.loansDetailList.querySelectorAll("[data-loan-id]")].forEach((card) => {
      card.addEventListener("click", () => {
        state.selectedLoanId = card.dataset.loanId;
        renderLoanCollections();
        updatePaymentSummary();
      });
    });

    renderPaymentLoanSelect(loans.filter((loan) => loan.status === "active"));
  }

  function renderPaymentLoanSelect(loans) {
    if (!loans.length) {
      dom.loanSelect.innerHTML = `<option value="">No outstanding loans</option>`;
      dom.loanSelect.value = "";
      updatePaymentSummary();
      return;
    }

    dom.loanSelect.innerHTML = loans.map((loan) => `
      <option value="${shared.escapeHtml(loan.id)}">${shared.escapeHtml(loan.id)} • ${shared.formatCurrency(loan.outstandingAmount)}</option>
    `).join("");

    if (!loans.find((loan) => loan.id === state.selectedLoanId)) {
      state.selectedLoanId = loans[0].id;
    }

    dom.loanSelect.value = state.selectedLoanId;
  }

  function updatePaymentSummary() {
    const borrower = state.bootstrap?.auth?.borrower;
    const selectedLoan = getSelectedLoan();
    const serviceFee = Number(borrower?.payment?.serviceFee || 0);
    const paymentType = dom.paymentTypeInputs.find((input) => input.checked)?.value || "full";

    dom.partialAmountGroup.style.display = paymentType === "partial" ? "block" : "none";

    if (!selectedLoan) {
      dom.paymentInstallmentDue.textContent = shared.formatCurrency(0);
      dom.paymentServiceFee.textContent = shared.formatCurrency(serviceFee);
      dom.paymentTotalToday.textContent = shared.formatCurrency(0);
      dom.earlyOutstandingPrincipal.textContent = shared.formatCurrency(0);
      dom.earlyPayoffBenefit.textContent = shared.formatCurrency(0);
      dom.earlyTotalPayoff.textContent = shared.formatCurrency(0);
      return;
    }

    const installmentDue = selectedLoan.installmentAmount;
    const partialAmount = Math.max(0, Number(dom.partialAmount.value || 0));
    const paymentAmount = paymentType === "partial"
      ? Math.min(selectedLoan.outstandingAmount, partialAmount || selectedLoan.installmentAmount)
      : selectedLoan.installmentAmount;

    const payoffBenefit = Math.round(selectedLoan.outstandingAmount * 0.035);
    const earlyTotal = Math.max(0, selectedLoan.outstandingAmount - payoffBenefit);

    dom.paymentInstallmentDue.textContent = shared.formatCurrency(installmentDue);
    dom.paymentServiceFee.textContent = shared.formatCurrency(serviceFee);
    dom.paymentTotalToday.textContent = shared.formatCurrency(paymentAmount + serviceFee);
    dom.earlyOutstandingPrincipal.textContent = shared.formatCurrency(selectedLoan.outstandingAmount);
    dom.earlyPayoffBenefit.textContent = shared.formatCurrency(payoffBenefit);
    dom.earlyTotalPayoff.textContent = shared.formatCurrency(earlyTotal);
    dom.confirmAmount.textContent = shared.formatCurrency(paymentAmount + serviceFee);
    dom.confirmMethod.textContent = state.paymentChannel;
  }

  function renderScore() {
    const score = state.bootstrap?.auth?.borrower?.score;
    if (!score?.current) {
      dom.creditScoreDisplay.textContent = "N/A";
      dom.creditScoreGrade.textContent = "No score yet";
      dom.profileCreditScore.textContent = "N/A";
      dom.scoreDriversList.innerHTML = `<div class="panel-empty-state compact">Credit drivers will appear here once your live profile data is available.</div>`;
      shared.drawLineChart(dom.scoreHistoryChart, []);
      return;
    }

    dom.creditScoreDisplay.textContent = String(score.current);
    dom.creditScoreGrade.textContent = score.grade;
    dom.profileCreditScore.textContent = String(score.current);
    dom.scoreDriversList.innerHTML = score.drivers.map((driver) => `
      <article class="driver-item driver-${shared.escapeHtml(driver.tone)}">
        <strong>${shared.escapeHtml(driver.title)}</strong>
        <p>${shared.escapeHtml(driver.value)}</p>
      </article>
    `).join("");

    if (dom.scoreFill) {
      const offset = 553 - ((score.current - 300) / 550) * 553;
      dom.scoreFill.style.strokeDashoffset = String(Math.max(0, Math.min(553, offset)));
    }

    shared.drawLineChart(dom.scoreHistoryChart, score.history);
  }

  function renderReferrals() {
    const referrals = state.bootstrap?.auth?.borrower?.referrals?.items || [];
    dom.referralsTableBody.innerHTML = referrals.length
      ? referrals.map((item) => `
          <tr>
            <td>${shared.escapeHtml(item.name)}</td>
            <td>${shared.formatDate(item.date)}</td>
            <td>${shared.escapeHtml(item.level)}</td>
            <td>${shared.formatCurrency(item.earned)}</td>
            <td>${shared.humanizeStatus(item.status)}</td>
          </tr>
        `).join("")
      : `<tr><td colspan="5" class="table-empty-state">No referral activity has been recorded for this account yet.</td></tr>`;
  }

  function renderNotifications() {
    const notifications = state.bootstrap?.auth?.borrower?.notifications || [];
    const badge = document.querySelector(".notification-badge");
    if (badge) {
      badge.textContent = String(notifications.filter((item) => !item.isRead).length);
    }

    dom.notificationsList.innerHTML = notifications.length
      ? notifications.map((item) => `
          <article class="notification-card notification-${shared.escapeHtml(item.level)}">
            <div class="notification-card-top">
              <strong>${shared.escapeHtml(item.title)}</strong>
              <span>${shared.formatDateTime(item.createdAt)}</span>
            </div>
            <p>${shared.escapeHtml(item.message)}</p>
          </article>
        `).join("")
      : `<div class="panel-empty-state">No notifications yet. New account alerts will appear here.</div>`;
  }

  function renderProfile() {
    const borrower = state.bootstrap?.auth?.borrower?.profile;
    if (!borrower) {
      dom.profileInitials.textContent = "M";
      dom.profileName.textContent = "Account holder";
      dom.profileStatusBadge.textContent = "Unverified";
      dom.profilePhone.textContent = "Phone not available";
      dom.profileLastLogin.textContent = "Last activity is not available yet.";
      dom.profileCustomerId.textContent = "--";
      dom.profileMemberSince.textContent = "--";
      dom.profilePhoneInfo.textContent = "Not provided";
      dom.profileEmail.textContent = "Not provided";
      dom.profileAccountStatus.textContent = "Unknown";
      dom.profileLastLoginInfo.textContent = "Not available";
      return;
    }

    dom.profileInitials.textContent = shared.initials(borrower.fullName);
    dom.profileName.textContent = borrower.fullName;
    dom.profileStatusBadge.textContent = shared.humanizeStatus(borrower.accountStatus);
    dom.profilePhone.textContent = borrower.phone;
    dom.profileLastLogin.textContent = borrower.lastLoginAt ? `Last activity ${shared.formatDateTime(borrower.lastLoginAt)}` : "No login recorded yet.";
    dom.profileCustomerId.textContent = `CC-${String(borrower.id).padStart(5, "0")}`;
    dom.profileMemberSince.textContent = shared.formatDate(borrower.memberSince);
    dom.profilePhoneInfo.textContent = borrower.phone;
    dom.profileEmail.textContent = borrower.email || "Not provided";
    dom.profileAccountStatus.textContent = shared.humanizeStatus(borrower.accountStatus);
    dom.profileLastLoginInfo.textContent = borrower.lastLoginAt ? shared.formatDateTime(borrower.lastLoginAt) : "Not available";
  }

  function renderChat() {
    const messages = state.bootstrap?.auth?.borrower?.supportMessages || [];
    dom.chatMessages.innerHTML = messages.length
      ? messages.map((message) => `
          <div class="chat-message ${message.senderRole === "borrower" ? "user" : "system"}">
            <p>${shared.escapeHtml(message.message)}</p>
          </div>
        `).join("")
      : `<div class="chat-message system"><p>Welcome to Crane Credit Support! How can we help you today?</p></div>`;

    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
  }

  async function submitChatMessage() {
    if (!ensureBorrowerSession()) {
      return;
    }

    const message = dom.chatInput.value.trim();
    if (!message) {
      return;
    }

    try {
      await shared.request("/api/support/messages", {
        method: "POST",
        body: { message }
      });
      dom.chatInput.value = "";
      await refreshDashboard({ quiet: true });
      dom.chatContainer.classList.add("active");
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function submitPayment() {
    if (!ensureBorrowerSession()) {
      return;
    }

    const selectedLoan = getSelectedLoan();
    if (!selectedLoan) {
      return;
    }

    const paymentType = dom.paymentTypeInputs.find((input) => input.checked)?.value || "full";
    const amount = paymentType === "partial"
      ? Number(dom.partialAmount.value || selectedLoan.installmentAmount)
      : selectedLoan.installmentAmount;

    try {
      await shared.request("/api/borrower/repayments", {
        method: "POST",
        body: {
          loanId: selectedLoan.id,
          paymentType,
          amount,
          channel: state.paymentChannel
        }
      });
      closePaymentModal();
      await refreshDashboard();
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function collectLoanDocuments() {
    const groups = [
      { input: dom.idFront, type: "id_front", label: "ID / passport front", multiple: false },
      { input: dom.idBack, type: "id_back", label: "ID / passport back", multiple: false },
      { input: dom.incomeProof, type: "income_proof", label: "Income proof", multiple: false },
      { input: dom.bankStatement, type: "bank_statement", label: "Bank statement", multiple: false },
      { input: dom.selfiePhoto, type: "selfie_photo", label: "Live selfie / verification photo", multiple: false },
      { input: dom.additionalDocuments, type: "additional_document", label: "Additional document", multiple: true }
    ];

    const documents = [];

    for (const group of groups) {
      const files = group.input?.files ? [...group.input.files] : [];
      if (!files.length) {
        continue;
      }

      for (const file of files) {
        documents.push({
          type: group.type,
          label: group.label,
          name: file.name,
          dataUrl: await shared.fileToDataUrl(file)
        });
      }
    }

    return documents;
  }

  function ensureBorrowerSession() {
    if (state.bootstrap?.auth?.loggedIn) {
      return true;
    }
    openLoginModal();
    return false;
  }

  function focusSupportWithMessage(message) {
    if (!state.bootstrap?.auth?.loggedIn) {
      openLoginModal();
      return;
    }
    dom.chatInput.value = message;
    dom.chatContainer.classList.add("active");
    dom.chatInput.focus();
  }

  function openLoginModal() {
    dom.loginModal.classList.add("active");
    toggleAuthMode("login");
  }

  function closeLoginModal() {
    dom.loginModal.classList.remove("active");
    clearAuthErrors();
    dom.loginForm.reset();
    dom.registerForm.reset();
  }

  function handleLoginEntry() {
    if (state.bootstrap?.auth?.loggedIn) {
      dom.profilePanel?.classList.add("active");
      return;
    }
    openLoginModal();
  }

  function toggleAuthMode(mode) {
    dom.loginForm.classList.toggle("active", mode === "login");
    dom.registerForm.classList.toggle("active", mode === "register");
  }

  function clearAuthErrors() {
    ["loginPhoneError", "loginPinError", "registerNameError", "registerPhoneError", "registerEmailError", "registerPinError", "registerPinConfirmError"].forEach((key) => {
      if (dom[key]) {
        dom[key].textContent = "";
      }
    });
  }

  function openContactModal() {
    dom.contactModalOverlay.classList.add("active");
  }

  function closeContactModal() {
    dom.contactModalOverlay.classList.remove("active");
  }

  function openPaymentModal() {
    dom.paymentModal.classList.add("active");
  }

  function closePaymentModal() {
    dom.paymentModal.classList.remove("active");
  }

  function openMobileMenu() {
    document.body.classList.add("mobile-menu-open");
    dom.dashboardSidebar.classList.add("active");
    dom.sidebarOverlay.classList.add("active");
  }

  function closeMobileMenu() {
    document.body.classList.remove("mobile-menu-open");
    dom.dashboardSidebar.classList.remove("active");
    dom.sidebarOverlay.classList.remove("active");
  }

  function populateSubcounties(district) {
    const items = districtMap[district] || districtMap.other;
    dom.applicantSubcounty.innerHTML = items.map((item, index) => `
      <option value="${shared.escapeHtml(item.toLowerCase())}" ${index === 0 ? "selected" : ""}>${shared.escapeHtml(item)}</option>
    `).join("");
  }

  function toggleEmploymentFields() {
    const value = dom.applicantCategory.value;
    const employmentInputs = [dom.employerName, dom.positionTitle, dom.employmentTenure];
    const businessInputs = [dom.businessName, dom.businessType, dom.businessRegistration];
    const employmentMode = value === "employee" || value === "civil_servant";

    employmentInputs.forEach((input) => {
      input.disabled = !employmentMode;
      if (!employmentMode) {
        input.value = "";
      }
    });

    businessInputs.forEach((input) => {
      input.disabled = employmentMode;
      if (employmentMode) {
        input.value = "";
      }
    });
  }

  function activateView(view) {
    state.currentView = view;
    dom.viewSections.forEach((section) => {
      section.classList.toggle("active", section.id === `${view}-view`);
    });
    dom.navLinks.forEach((link) => link.classList.toggle("active", link.dataset.view === view));
    dom.menuItems.forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  }

  function getSelectedLoan() {
    const loans = state.bootstrap?.auth?.borrower?.loans || [];
    return loans.find((loan) => loan.id === (dom.loanSelect.value || state.selectedLoanId)) || null;
  }

  function drawHeaderWave() {
    const canvas = dom.sectionWaveCanvas;
    if (!canvas || !canvas.getContext) {
      return;
    }

    const context = canvas.getContext("2d");
    const width = canvas.parentElement?.clientWidth || 500;
    const height = canvas.parentElement?.clientHeight || 180;
    canvas.width = width;
    canvas.height = height;

    context.clearRect(0, 0, width, height);
    const gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, "rgba(13, 139, 99, 0.65)");
    gradient.addColorStop(1, "rgba(230, 184, 78, 0.45)");
    context.strokeStyle = gradient;
    context.lineWidth = 6;
    context.beginPath();
    context.moveTo(0, height * 0.62);
    for (let x = 0; x <= width; x += 14) {
      const y = height * 0.62 + Math.sin(x / 38) * 12;
      context.lineTo(x, y);
    }
    context.stroke();
  }

  function toCamel(value) {
    return String(value).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }
})();
