(function adminLoginPage() {
  const shared = window.CraneShared;
  const form = document.getElementById("admin-login-form");
  const usernameInput = document.getElementById("admin-username");
  const pinInput = document.getElementById("admin-pin");
  const errorBox = document.getElementById("admin-login-error");
  const brandButton = document.getElementById("admin-login-brand-btn");
  const homeButton = document.getElementById("admin-login-home-btn");
  const supportButton = document.getElementById("admin-login-support-btn");

  brandButton?.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  homeButton?.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  supportButton?.addEventListener("click", () => {
    window.location.href = "terms.html";
  });

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      await shared.request("/api/admin/me");
      window.location.href = "admin.html";
    } catch (error) {
      if (error.status && error.status !== 401 && error.status !== 403) {
        console.warn(error);
      }
    }
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.textContent = "";

    try {
      await shared.request("/api/admin/login", {
        method: "POST",
        body: {
          username: usernameInput.value.trim(),
          pin: pinInput.value.trim()
        }
      });

      window.location.href = "admin.html";
    } catch (error) {
      errorBox.textContent = error.message;
    }
  });
})();
