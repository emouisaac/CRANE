(function adminLoginPage() {
  const form = document.getElementById("admin-login-form");
  const usernameInput = document.getElementById("admin-username");
  const pinInput = document.getElementById("admin-pin");
  const errorBox = document.getElementById("admin-login-error");

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const response = await fetch("/api/admin/me", { credentials: "same-origin" });
      if (response.ok) {
        window.location.href = "admin.html";
      }
    } catch (error) {
      console.warn(error);
    }
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.textContent = "";

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: usernameInput.value.trim(),
          pin: pinInput.value.trim()
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not sign in.");
      }

      window.location.href = "admin.html";
    } catch (error) {
      errorBox.textContent = error.message;
    }
  });
})();
