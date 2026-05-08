(() => {
  const STORAGE_KEY = "crane-shared-state-v2";
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
    return {
      metadata: {
        knownPhones: [],
      },
      admin: {
        applications: [],
        adminUsers: [],
        riskAlerts: [],
        auditLogs: [],
        settings: {},
      },
      loans: [],
      customers: [],
      notifications: [],
      referrals: [],
      user: {},
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeState(rawState) {
    const incoming = rawState && typeof rawState === "object" ? rawState : {};
    const knownPhones = Array.isArray(incoming.metadata?.knownPhones)
      ? Array.from(new Set(incoming.metadata.knownPhones.map((phone) => String(phone).trim()).filter(Boolean)))
      : [];

    return {
      metadata: {
        knownPhones,
      },
      admin: {
        applications: Array.isArray(incoming.admin?.applications) ? clone(incoming.admin.applications) : [],
        adminUsers: Array.isArray(incoming.admin?.adminUsers) ? clone(incoming.admin.adminUsers) : [],
        riskAlerts: Array.isArray(incoming.admin?.riskAlerts) ? clone(incoming.admin.riskAlerts) : [],
        auditLogs: Array.isArray(incoming.admin?.auditLogs) ? clone(incoming.admin.auditLogs) : [],
        settings: typeof incoming.admin?.settings === 'object' && incoming.admin?.settings ? clone(incoming.admin.settings) : {},
      },
      loans: Array.isArray(incoming.loans) ? clone(incoming.loans) : [],
      customers: Array.isArray(incoming.customers) ? clone(incoming.customers) : [],
      notifications: Array.isArray(incoming.notifications) ? clone(incoming.notifications) : [],
      referrals: Array.isArray(incoming.referrals) ? clone(incoming.referrals) : [],
      user: typeof incoming.user === 'object' && incoming.user ? clone(incoming.user) : {},
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
        ...(options.headers || {}),
      },
      ...options,
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
    cachedState = normalized;
    emitChange();

    const payload = await requestSharedState(STORE_ENDPOINT, {
      method: "PUT",
      body: JSON.stringify({ state: normalized }),
    });

    cachedState = normalizeState(payload.data || normalized);
    hasHydrated = true;
    emitChange();
    return read();
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
        knownPhones: Array.from(existingPhones),
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
    startAutoSync,
  };
})();
