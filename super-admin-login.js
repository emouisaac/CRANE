(function superAdminLoginPage() {
  const shared = window.CraneShared;
  const form = document.getElementById("super-admin-login-form");
  const usernameInput = document.getElementById("super-admin-username");
  const passwordInput = document.getElementById("super-admin-password");
  const errorBox = document.getElementById("super-admin-login-error");
  const brandButton = document.getElementById("super-login-brand-btn");
  const homeButton = document.getElementById("super-login-home-btn");
  const adminButton = document.getElementById("super-login-admin-btn");

  brandButton?.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  homeButton?.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  adminButton?.addEventListener("click", () => {
    window.location.href = "admin-login.html";
  });

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      await shared.request("/api/super-admin/me");
      window.location.href = "super-admin.html";
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
      await shared.request("/api/super-admin/login", {
        method: "POST",
        body: {
          username: usernameInput.value.trim(),
          password: passwordInput.value
        }
      });

      window.location.href = "super-admin.html";
    } catch (error) {
      errorBox.textContent = error.message;
    }
  });
})();
