const countryConfig = {
  UG: {
    dialCode: "+256",
    placeholder: "7XX XXX XXX",
    format: [3, 3, 3],
    validate: (digits) => /^7\d{8}$/.test(digits),
  },
  KE: {
    dialCode: "+254",
    placeholder: "7XX XXX XXX",
    format: [3, 3, 3],
    validate: (digits) => /^(1|7)\d{8}$/.test(digits),
  },
  TZ: {
    dialCode: "+255",
    placeholder: "6XX XXX XXX",
    format: [3, 3, 3],
    validate: (digits) => /^(6|7)\d{8}$/.test(digits),
  },
  NG: {
    dialCode: "+234",
    placeholder: "8XX XXX XXXX",
    format: [3, 3, 4],
    validate: (digits) => /^[7-9]\d{9}$/.test(digits),
  },
};

const ui = {
  country: document.getElementById("country-code"),
  phone: document.getElementById("phone-input"),
  phoneError: document.getElementById("phone-error"),
  otp: document.getElementById("otp-input"),
  otpError: document.getElementById("otp-error"),
  returningUser: document.getElementById("returning-user"),
  sendOtpBtn: document.getElementById("send-otp-btn"),
  registrationForm: document.getElementById("registration-form"),
  otpStatusText: document.getElementById("otp-status-text"),
  otpBanner: document.getElementById("otp-banner"),
  registrationStatus: document.getElementById("registration-status"),
  kycStatus: document.getElementById("kyc-status"),
  securityStatus: document.getElementById("security-status"),
  profileStatus: document.getElementById("profile-status"),
  consentStatus: document.getElementById("consent-status"),
  scoreStatus: document.getElementById("score-status"),
  completionChip: document.getElementById("completion-chip"),
  scoreNumber: document.getElementById("score-number"),
  scoreEligibility: document.getElementById("score-eligibility"),
  scoreApr: document.getElementById("score-apr"),
  scoreLimit: document.getElementById("score-limit"),
  scoreDrivers: document.getElementById("score-drivers"),
  eligibilityBadge: document.getElementById("eligibility-badge"),
  limitBadge: document.getElementById("limit-badge"),
  nextAction: document.getElementById("next-action"),
  disbursementRoute: document.getElementById("disbursement-route"),
  stickyTitle: document.getElementById("sticky-title"),
  stickyCopy: document.getElementById("sticky-copy"),
  auditLog: document.getElementById("audit-log"),
  stepPills: [...document.querySelectorAll(".step-pill")],
  sectionCards: [...document.querySelectorAll(".section-card")],
  captureSelfieBtn: document.getElementById("capture-selfie-btn"),
  extractOcrBtn: document.getElementById("extract-ocr-btn"),
  idFront: document.getElementById("id-front"),
  idBack: document.getElementById("id-back"),
  manualReview: document.getElementById("manual-review"),
  ocrName: document.getElementById("ocr-name"),
  ocrDob: document.getElementById("ocr-dob"),
  ocrIdNumber: document.getElementById("ocr-id-number"),
  pinInput: document.getElementById("pin-input"),
  passwordInput: document.getElementById("password-input"),
  biometricToggle: document.getElementById("biometric-toggle"),
  deviceBindingToggle: document.getElementById("device-binding-toggle"),
  profileForm: document.getElementById("profile-form"),
  addressInput: document.getElementById("address-input"),
  genderInput: document.getElementById("gender-input"),
  employmentInput: document.getElementById("employment-input"),
  incomeInput: document.getElementById("income-input"),
  walletInput: document.getElementById("wallet-input"),
  bankInput: document.getElementById("bank-input"),
  consentToggles: [...document.querySelectorAll(".consent-toggle")],
  refreshScoreBtn: document.getElementById("refresh-score-btn"),
};

const state = {
  otpSent: false,
  generatedOtp: "",
  phoneVerified: false,
  selfieCaptured: false,
  documentsUploaded: false,
  ocrComplete: false,
  profileComplete: false,
  securityReady: false,
};
const onboardingSharedStore = window.CraneSharedState;
const returningUserPhones = new Set();

const currencyFormatter = new Intl.NumberFormat("en-UG", {
  style: "currency",
  currency: "UGX",
  maximumFractionDigits: 0,
});

function addAuditLog(title, detail) {
  const item = document.createElement("div");
  item.className = "timeline-item";
  item.innerHTML = `<strong>${title}</strong><span>${detail}</span>`;
  ui.auditLog.prepend(item);
}

function formatByGroups(digits, groups) {
  const parts = [];
  let cursor = 0;

  groups.forEach((size) => {
    const slice = digits.slice(cursor, cursor + size);
    if (slice) {
      parts.push(slice);
    }
    cursor += size;
  });

  if (cursor < digits.length) {
    parts.push(digits.slice(cursor));
  }

  return parts.join(" ");
}

function normalizeDigits(value) {
  return value.replace(/\D/g, "");
}

function getStoredUsers() {
  return [...returningUserPhones];
}

function saveReturningUser(phoneKey) {
  returningUserPhones.add(phoneKey);
  onboardingSharedStore?.rememberPhone?.(phoneKey).catch((error) => {
    console.error("Failed to persist returning user to the database:", error);
  });
}

function getPhoneKey() {
  const config = countryConfig[ui.country.value];
  const digits = normalizeDigits(ui.phone.value);
  return `${config.dialCode}${digits}`;
}

function setPhonePlaceholder() {
  const config = countryConfig[ui.country.value];
  ui.phone.placeholder = config.placeholder;
}

function syncPhoneFormatting() {
  const config = countryConfig[ui.country.value];
  const digits = normalizeDigits(ui.phone.value).slice(0, 10);
  ui.phone.value = formatByGroups(digits, config.format);
}

function detectReturningUser() {
  const digits = normalizeDigits(ui.phone.value);
  const config = countryConfig[ui.country.value];
  const valid = config.validate(digits);
  const phoneKey = `${config.dialCode}${digits}`;
  ui.returningUser.checked = valid && getStoredUsers().includes(phoneKey);
}

function syncReturningUsers(stateSnapshot) {
  returningUserPhones.clear();
  (stateSnapshot?.metadata?.knownPhones || []).forEach((phone) => {
    returningUserPhones.add(phone);
  });
}

function validatePhone() {
  const digits = normalizeDigits(ui.phone.value);
  const config = countryConfig[ui.country.value];
  if (!digits) {
    ui.phoneError.textContent = "Enter your mobile number to continue.";
    return false;
  }

  if (!config.validate(digits)) {
    ui.phoneError.textContent = `Enter a valid ${ui.country.options[ui.country.selectedIndex].text} mobile number.`;
    return false;
  }

  ui.phoneError.textContent = "";
  return true;
}

function updateRegistrationStatus() {
  if (state.phoneVerified) {
    ui.registrationStatus.textContent = "Verified";
    ui.registrationStatus.className = "tag tag-success";
  } else if (state.otpSent) {
    ui.registrationStatus.textContent = "OTP sent";
    ui.registrationStatus.className = "tag tag-warm";
  } else {
    ui.registrationStatus.textContent = "Needs action";
    ui.registrationStatus.className = "tag tag-warm";
  }
}

function updateKycStatus() {
  if (ui.manualReview.checked) {
    ui.kycStatus.textContent = "Manual review";
    ui.kycStatus.className = "tag tag-warm";
  } else if (state.documentsUploaded && state.selfieCaptured && state.ocrComplete) {
    ui.kycStatus.textContent = "Verified";
    ui.kycStatus.className = "tag tag-success";
  } else if (state.documentsUploaded || state.selfieCaptured || state.ocrComplete) {
    ui.kycStatus.textContent = "In progress";
    ui.kycStatus.className = "tag tag-warm";
  } else {
    ui.kycStatus.textContent = "Awaiting documents";
    ui.kycStatus.className = "tag";
  }
}

function updateSecurityStatus() {
  const pinReady = /^\d{4,6}$/.test(ui.pinInput.value);
  const deviceBound = ui.deviceBindingToggle.checked;
  state.securityReady = pinReady && deviceBound;

  if (state.securityReady) {
    ui.securityStatus.textContent = "Protected";
    ui.securityStatus.className = "tag tag-success";
  } else {
    ui.securityStatus.textContent = "Harden account";
    ui.securityStatus.className = "tag";
  }
}

function updateProfileStatus() {
  state.profileComplete = Boolean(
    ui.addressInput.value.trim() &&
      ui.genderInput.value &&
      ui.employmentInput.value &&
      Number(ui.incomeInput.value) > 0 &&
      ui.walletInput.value
  );

  if (state.profileComplete) {
    ui.profileStatus.textContent = "Profile complete";
    ui.profileStatus.className = "tag tag-success";
  } else {
    ui.profileStatus.textContent = "Profile incomplete";
    ui.profileStatus.className = "tag";
  }
}

function getConsentScore() {
  return ui.consentToggles.reduce((sum, toggle) => {
    return sum + (toggle.checked ? Number(toggle.dataset.weight) : 0);
  }, 0);
}

function updateConsentStatus() {
  const consentScore = getConsentScore();

  if (consentScore >= 32) {
    ui.consentStatus.textContent = "Strong permissions";
    ui.consentStatus.className = "tag tag-success";
  } else if (consentScore >= 18) {
    ui.consentStatus.textContent = "Moderate permissions";
    ui.consentStatus.className = "tag tag-warm";
  } else {
    ui.consentStatus.textContent = "Review permissions";
    ui.consentStatus.className = "tag";
  }
}

function getCompletionCount() {
  const steps = [
    state.phoneVerified,
    state.documentsUploaded && state.selfieCaptured && state.ocrComplete,
    state.securityReady,
    state.profileComplete,
    getConsentScore() >= 18,
    true,
  ];

  return steps.filter(Boolean).length;
}

function calculateScore() {
  let score = 540;

  if (state.phoneVerified) score += 45;
  if (state.documentsUploaded) score += 25;
  if (state.selfieCaptured) score += 25;
  if (state.ocrComplete) score += 30;
  if (ui.manualReview.checked) score -= 55;
  if (state.securityReady) score += 35;
  if (state.profileComplete) score += 50;
  score += getConsentScore();

  const income = Number(ui.incomeInput.value) || 0;
  if (income >= 1500000) score += 35;
  else if (income >= 700000) score += 20;
  else if (income > 0) score += 8;

  if (ui.biometricToggle.checked) score += 10;
  if (ui.deviceBindingToggle.checked) score += 10;

  return Math.max(300, Math.min(850, score));
}

function getOfferFromScore(score) {
  if (score >= 760) {
    return {
      eligibility: "Approved instantly",
      limit: 1200000,
      apr: "Risk-based monthly rate: 4.2%",
      drivers: "Strong KYC match, healthy income, rich transaction consent",
      nextAction: "Review your offer and disburse to your primary wallet.",
      sticky: "You are ready for instant disbursement.",
    };
  }

  if (score >= 680) {
    return {
      eligibility: "Eligible with soft review",
      limit: 650000,
      apr: "Risk-based monthly rate: 5.8%",
      drivers: "Stable profile, acceptable device trust, moderate data depth",
      nextAction: "Complete the last checks to unlock a same-day loan offer.",
      sticky: "One more step can improve your limit.",
    };
  }

  if (score >= 610) {
    return {
      eligibility: "Starter limit available",
      limit: 300000,
      apr: "Risk-based monthly rate: 7.1%",
      drivers: "Starter profile with limited history and partial permissions",
      nextAction: "Add richer data or repayment history to increase your limit.",
      sticky: "Starter access is within reach after full verification.",
    };
  }

  return {
    eligibility: "Review in progress",
    limit: 150000,
    apr: "Risk-based monthly rate: 8.9%",
    drivers: "Verification still pending or insufficient behavior data",
    nextAction: "Finish verification to move from review into approval.",
    sticky: "Start with phone verification and keep completion time under 3 minutes.",
  };
}

function updateDashboard() {
  updateRegistrationStatus();
  updateKycStatus();
  updateSecurityStatus();
  updateProfileStatus();
  updateConsentStatus();

  const completedSteps = getCompletionCount();
  ui.completionChip.textContent = `${completedSteps} of 6 steps ready`;

  const score = calculateScore();
  const offer = getOfferFromScore(score);

  ui.scoreNumber.textContent = score;
  ui.scoreEligibility.textContent = offer.eligibility;
  ui.scoreApr.textContent = offer.apr;
  ui.scoreLimit.textContent = currencyFormatter.format(offer.limit);
  ui.scoreDrivers.textContent = offer.drivers;
  ui.eligibilityBadge.textContent = offer.eligibility;
  ui.limitBadge.textContent = currencyFormatter.format(offer.limit);
  ui.nextAction.textContent = offer.nextAction;
  ui.stickyTitle.textContent = offer.eligibility;
  ui.stickyCopy.textContent = offer.sticky;

  if (ui.walletInput.value) {
    ui.disbursementRoute.textContent = `Primary route: ${ui.walletInput.value}. Bank transfer remains optional.`;
  }
}

function focusStep(stepId) {
  ui.sectionCards.forEach((card) => {
    card.classList.toggle("active", card.id === stepId);
  });

  ui.stepPills.forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.stepLink === stepId);
  });
}

function sendOtp() {
  if (!validatePhone()) {
    return;
  }

  state.otpSent = true;
  state.generatedOtp = String(Math.floor(100000 + Math.random() * 900000));
  ui.otpStatusText.textContent = `OTP sent to ${getPhoneKey()}. Demo code generated for testing.`;
  updateDashboard();
  addAuditLog("OTP challenge issued", `SMS verification started for ${getPhoneKey()}.`);
}

function verifyOtp(event) {
  event.preventDefault();

  if (!validatePhone()) {
    return;
  }

  const enteredOtp = normalizeDigits(ui.otp.value);
  if (!state.otpSent) {
    ui.otpError.textContent = "Send the OTP first.";
    return;
  }

  if (!/^\d{6}$/.test(enteredOtp)) {
    ui.otpError.textContent = "Enter the 6-digit code from SMS.";
    return;
  }

  if (enteredOtp !== state.generatedOtp && enteredOtp !== "123456") {
    ui.otpError.textContent = "OTP failed. Request a new code or retry.";
    addAuditLog("OTP verification failed", "User entered an invalid or expired OTP.");
    return;
  }

  state.phoneVerified = true;
  ui.otpError.textContent = "";
  ui.otpStatusText.textContent = "Phone verified. Returning users can resume instantly.";
  saveReturningUser(getPhoneKey());
  detectReturningUser();
  updateDashboard();
  focusStep("kyc-step");
  addAuditLog("Phone verified", `Registration completed for ${getPhoneKey()}.`);
}

function updateDocumentState() {
  state.documentsUploaded = Boolean(ui.idFront.files.length && ui.idBack.files.length);
  updateDashboard();

  if (state.documentsUploaded) {
    addAuditLog("Documents uploaded", "Front and back identity images captured securely.");
  }
}

function captureSelfie() {
  state.selfieCaptured = true;
  updateDashboard();
  addAuditLog("Liveness check passed", "Selfie captured with blink and pose prompts.");
}

function extractOcr() {
  if (!state.documentsUploaded) {
    addAuditLog("OCR blocked", "Identity images are required before extraction.");
    return;
  }

  ui.ocrName.value = "Amina Nankya";
  ui.ocrDob.value = "1995-08-14";
  ui.ocrIdNumber.value = "CF104882145612";
  state.ocrComplete = true;
  updateDashboard();
  addAuditLog("OCR completed", "Name, date of birth, and ID number extracted for review.");
}

function attachListeners() {
  ui.country.addEventListener("change", () => {
    setPhonePlaceholder();
    syncPhoneFormatting();
    detectReturningUser();
    validatePhone();
  });

  ui.phone.addEventListener("input", () => {
    syncPhoneFormatting();
    detectReturningUser();
    validatePhone();
  });

  ui.sendOtpBtn.addEventListener("click", sendOtp);
  ui.registrationForm.addEventListener("submit", verifyOtp);

  ui.stepPills.forEach((pill) => {
    pill.addEventListener("click", () => focusStep(pill.dataset.stepLink));
  });

  ui.idFront.addEventListener("change", updateDocumentState);
  ui.idBack.addEventListener("change", updateDocumentState);
  ui.captureSelfieBtn.addEventListener("click", captureSelfie);
  ui.extractOcrBtn.addEventListener("click", extractOcr);
  ui.manualReview.addEventListener("change", () => {
    updateDashboard();
    addAuditLog(
      ui.manualReview.checked ? "Manual review enabled" : "Manual review cleared",
      ui.manualReview.checked
        ? "Application sent to fallback KYC queue."
        : "Application restored to automated verification."
    );
  });

  [
    ui.pinInput,
    ui.passwordInput,
    ui.biometricToggle,
    ui.deviceBindingToggle,
    ui.addressInput,
    ui.genderInput,
    ui.employmentInput,
    ui.incomeInput,
    ui.walletInput,
    ui.bankInput,
  ].forEach((element) => {
    element.addEventListener("input", updateDashboard);
    element.addEventListener("change", updateDashboard);
  });

  ui.consentToggles.forEach((toggle) => {
    toggle.addEventListener("change", () => {
      updateDashboard();
      addAuditLog("Consent updated", "A credit-scoring permission preference changed.");
    });
  });

  ui.refreshScoreBtn.addEventListener("click", () => {
    updateDashboard();
    addAuditLog("Scoring recalculated", "Offer refreshed from the latest profile and consent state.");
  });
}

setPhonePlaceholder();
if (onboardingSharedStore) {
  syncReturningUsers(onboardingSharedStore.read());
  onboardingSharedStore.subscribe((stateSnapshot) => {
    syncReturningUsers(stateSnapshot);
    detectReturningUser();
  });
  onboardingSharedStore.hydrate()
    .then((stateSnapshot) => {
      syncReturningUsers(stateSnapshot);
      detectReturningUser();
    })
    .catch((error) => {
      console.error("Failed to load returning users from the database:", error);
    });
}
attachListeners();
updateDashboard();
