(function superAdminLoginPage() {
  const form = document.getElementById("super-admin-login-form");
  const usernameInput = document.getElementById("super-admin-username");
  const passwordInput = document.getElementById("super-admin-password");
  const errorBox = document.getElementById("super-admin-login-error");

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const response = await fetch("/api/super-admin/me", { credentials: "same-origin" });
      if (response.ok) {
        window.location.href = "super-admin.html";
      }
    } catch (error) {
      console.warn(error);
    }
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.textContent = "";

    try {
      const response = await fetch("/api/super-admin/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: usernameInput.value.trim(),
          password: passwordInput.value
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not sign in.");
      }

      window.location.href = "super-admin.html";
    } catch (error) {
      errorBox.textContent = error.message;
    }
  });
})();
