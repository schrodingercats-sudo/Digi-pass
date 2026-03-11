const state = {
  admin: null,
  event: null,
  scanner: null,
  scannerActive: false,
  scanInFlight: false,
  lastDecodedValue: "",
  lastDecodedAt: 0,
  historyRefreshHandle: null
};
const LOCAL_API_ORIGIN = "http://127.0.0.1:3000";
const LOCALHOST_API_ORIGIN = "http://localhost:3000";

const els = {
  adminIdentityLine: document.getElementById("adminIdentityLine"),
  logoutButton: document.getElementById("logoutButton"),
  loginPanel: document.getElementById("loginPanel"),
  scannerPanel: document.getElementById("scannerPanel"),
  historyPanel: document.getElementById("historyPanel"),
  overridePanel: document.getElementById("overridePanel"),
  adminsPanel: document.getElementById("adminsPanel"),
  loginForm: document.getElementById("loginForm"),
  loginStatus: document.getElementById("loginStatus"),
  seedForm: document.getElementById("seedForm"),
  startScannerButton: document.getElementById("startScannerButton"),
  stopScannerButton: document.getElementById("stopScannerButton"),
  scannerViewport: document.getElementById("scannerViewport"),
  manualForm: document.getElementById("manualForm"),
  manualCodeInput: document.getElementById("manualCodeInput"),
  scanResult: document.getElementById("scanResult"),
  scanResultCode: document.getElementById("scanResultCode"),
  scanResultMessage: document.getElementById("scanResultMessage"),
  historyList: document.getElementById("historyList"),
  overrideForm: document.getElementById("overrideForm"),
  overrideStatus: document.getElementById("overrideStatus"),
  createAdminForm: document.getElementById("createAdminForm"),
  adminList: document.getElementById("adminList")
};

const api = async (url, options = {}) => {
  const buildCandidates = (inputUrl) => {
    if (/^https?:\/\//i.test(inputUrl)) {
      return [inputUrl];
    }

    const candidates = [];
    if (window.location.origin && /^https?:/i.test(window.location.origin)) {
      candidates.push(`${window.location.origin}${inputUrl}`);
    }

    if (window.location.protocol !== "https:") {
      candidates.push(`${LOCAL_API_ORIGIN}${inputUrl}`);
      candidates.push(`${LOCALHOST_API_ORIGIN}${inputUrl}`);
    }

    return [...new Set(candidates)];
  };

  const candidates = buildCandidates(url);
  const attempted = [];

  for (const candidateUrl of candidates) {
    try {
      const candidateOrigin = new URL(candidateUrl).origin;
      const credentials = candidateOrigin === window.location.origin ? "same-origin" : "omit";

      const response = await fetch(candidateUrl, {
        credentials,
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        }
      });

      const payload = await response.json().catch(() => ({}));
      attempted.push(`${candidateUrl} -> ${response.status}`);

      const shouldTryNext =
        (response.status === 404 || response.status === 405) &&
        candidateUrl !== candidates[candidates.length - 1];

      if (shouldTryNext) {
        continue;
      }

      return { response, payload, networkError: null, attempted, apiUrl: candidateUrl };
    } catch (error) {
      attempted.push(`${candidateUrl} -> network_error(${error?.message || "failed"})`);
    }
  }

  return {
    response: null,
    payload: {},
    networkError: `Failed to fetch. Tried: ${attempted.join(" | ")}`,
    attempted,
    apiUrl: null
  };
};

const setStatusStrip = (element, message, tone = "neutral") => {
  element.textContent = message;
  element.dataset.tone = tone;
  const toneMap = {
    success: "var(--green)",
    warning: "var(--amber)",
    error: "var(--red)"
  };
  element.style.color = toneMap[tone] || "var(--muted)";
};

const setScanResult = ({ code, message, category = "neutral" }) => {
  els.scanResult.className = `scan-result ${category}`;
  els.scanResultCode.textContent = code.toUpperCase();
  els.scanResultMessage.textContent = message;
};

const formatTime = (iso) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "short", timeStyle: "medium" }).format(new Date(iso));

const beep = (type) => {
  const toneByType = {
    success: 760,
    warning: 420,
    error: 230
  };

  const frequency = toneByType[type] || 520;
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.value = 0.04;
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.15);
};

const renderAdminState = () => {
  const isLoggedIn = Boolean(state.admin);
  els.loginPanel.classList.toggle("hidden", isLoggedIn);
  els.scannerPanel.classList.toggle("hidden", !isLoggedIn);
  els.historyPanel.classList.toggle("hidden", !isLoggedIn);
  els.overridePanel.classList.toggle("hidden", !isLoggedIn);
  els.logoutButton.classList.toggle("hidden", !isLoggedIn);
  els.adminsPanel.classList.toggle("hidden", !isLoggedIn);

  if (!isLoggedIn) {
    els.adminIdentityLine.textContent = "Session not active";
    return;
  }

  els.adminIdentityLine.textContent = `${state.admin.fullName} (${state.admin.role}) | ${state.event.eventName}`;
  const canManageAdmins = state.admin.role === "supervisor";
  els.createAdminForm.classList.toggle("hidden", !canManageAdmins);
};

const renderHistory = (logs) => {
  if (!logs.length) {
    els.historyList.innerHTML = '<li class="history-item"><p>No scans yet.</p></li>';
    return;
  }

  els.historyList.innerHTML = logs
    .map((log) => {
      const reasonLine = log.reason ? `<p>${log.reason}</p>` : "";
      return `<li class="history-item">
        <p><strong>${log.result}</strong> | ${log.pass_code_snapshot || "N/A"}</p>
        <p>${log.attendee_name_snapshot || "Unknown attendee"} | ${log.admin_name_snapshot || "Unknown admin"}</p>
        ${reasonLine}
        <p class="mono-line">${formatTime(log.created_at)} | ${log.scan_channel}</p>
      </li>`;
    })
    .join("");
};

const renderAdmins = (admins) => {
  if (!admins.length) {
    els.adminList.innerHTML = '<li class="admin-item"><p>No admins found.</p></li>';
    return;
  }

  els.adminList.innerHTML = admins
    .map((admin) => `<li class="admin-item">
      <p><strong>${admin.fullName}</strong> | ${admin.role}</p>
      <p>${admin.email}</p>
      <p class="mono-line">${admin.isActive ? "active" : "inactive"}</p>
    </li>`)
    .join("");
};

const loadScanHistory = async () => {
  const { response, payload, networkError } = await api("/api/admin-history?limit=30");
  if (networkError || !response || !response.ok || !payload.ok) {
    return;
  }
  renderHistory(payload.logs || []);
};

const loadAdminUsers = async () => {
  if (!state.admin || state.admin.role !== "supervisor") {
    return;
  }

  const { response, payload, networkError } = await api("/api/admin-users");
  if (networkError || !response || !response.ok || !payload.ok) {
    return;
  }
  renderAdmins(payload.admins || []);
};

const redeemScannedValue = async (scannedValue, scanChannel) => {
  if (state.scanInFlight) {
    return;
  }

  state.scanInFlight = true;
  setScanResult({
    category: "neutral",
    code: "verifying",
    message: "Verifying pass..."
  });

  try {
    const { response, payload, networkError } = await api("/api/admin-redeem", {
      method: "POST",
      body: JSON.stringify({
        scannedValue,
        scanChannel
      })
    });

    if (networkError) {
      setScanResult({
        category: "error",
        code: "network_error",
        message: networkError
      });
      beep("error");
      return;
    }

    if (!payload.ok) {
      setScanResult({
        category: "error",
        code: "error",
        message: payload.error?.message || "Scan request failed."
      });
      beep("error");
      return;
    }

    const result = payload.result;
    const attendee = payload.pass?.name ? ` (${payload.pass.name})` : "";
    setScanResult({
      category: result.category,
      code: result.code,
      message: `${result.message}${attendee}`
    });
    beep(result.category);
    await loadScanHistory();

    if (!response.ok && result.category === "error") {
      setStatusStrip(els.loginStatus, "Scan rejected.", "error");
    }
  } finally {
    state.scanInFlight = false;
  }
};

const onDecoded = (decodedText) => {
  if (state.scanInFlight) {
    return;
  }

  const now = Date.now();
  if (decodedText === state.lastDecodedValue && now - state.lastDecodedAt < 1200) {
    return;
  }

  state.lastDecodedValue = decodedText;
  state.lastDecodedAt = now;
  redeemScannedValue(decodedText, "camera");
};

const ensureScannerAnchor = () => {
  let anchor = document.getElementById("scannerReaderAnchor");
  if (!anchor) {
    anchor = document.createElement("div");
    anchor.id = "scannerReaderAnchor";
    els.scannerViewport.innerHTML = "";
    els.scannerViewport.appendChild(anchor);
  }
  return anchor.id;
};

const startScanner = async () => {
  if (state.scannerActive) {
    return;
  }

  if (!window.Html5Qrcode) {
    setScanResult({
      category: "error",
      code: "scanner",
      message: "Scanner library failed to load."
    });
    return;
  }

  try {
    const anchorId = ensureScannerAnchor();
    state.scanner = new Html5Qrcode(anchorId);
    await state.scanner.start(
      { facingMode: "environment" },
      {
        fps: 18,
        qrbox: { width: 280, height: 180 },
        aspectRatio: 1.777
      },
      onDecoded,
      () => {}
    );

    state.scannerActive = true;
    setScanResult({
      category: "neutral",
      code: "live",
      message: "Camera active. Start scanning passes."
    });
  } catch (error) {
    setScanResult({
      category: "error",
      code: "camera_error",
      message: error.message || "Unable to start camera."
    });
  }
};

const stopScanner = async () => {
  if (!state.scanner || !state.scannerActive) {
    return;
  }

  try {
    await state.scanner.stop();
    await state.scanner.clear();
  } catch (error) {
    // No-op; stopping scanner is best effort.
  } finally {
    state.scanner = null;
    state.scannerActive = false;
    setScanResult({
      category: "neutral",
      code: "idle",
      message: "Camera stopped."
    });
    els.scannerViewport.innerHTML = "";
  }
};

const login = async ({ email, password }) => {
  const { response, payload, networkError } = await api("/api/admin-login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });

  if (networkError) {
    setStatusStrip(els.loginStatus, networkError, "error");
    return;
  }

  if (!response || !response.ok || !payload.ok) {
    setStatusStrip(els.loginStatus, payload.error?.message || "Login failed.", "error");
    return;
  }

  state.admin = payload.admin;
  state.event = payload.event;
  renderAdminState();
  setStatusStrip(els.loginStatus, "Session started.", "success");
  setScanResult({
    code: "ready",
    message: "Ready to scan.",
    category: "neutral"
  });
  await loadScanHistory();
  await loadAdminUsers();
  if (state.historyRefreshHandle) {
    window.clearInterval(state.historyRefreshHandle);
  }
  state.historyRefreshHandle = window.setInterval(loadScanHistory, 5000);
};

const logout = async () => {
  await stopScanner();
  const { networkError } = await api("/api/admin-logout", {
    method: "POST"
  });
  if (networkError) {
    setStatusStrip(els.loginStatus, networkError, "error");
    return;
  }
  state.admin = null;
  state.event = null;
  renderAdminState();
  els.historyList.innerHTML = "";
  els.adminList.innerHTML = "";
  setStatusStrip(els.loginStatus, "Logged out.");
  if (state.historyRefreshHandle) {
    window.clearInterval(state.historyRefreshHandle);
    state.historyRefreshHandle = null;
  }
};

const seedSupervisor = async (payload) => {
  const { response, payload: result, networkError } = await api("/api/admin-seed-supervisor", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  if (networkError) {
    setStatusStrip(els.loginStatus, networkError, "error");
    return;
  }

  if (!response || !response.ok || !result.ok) {
    setStatusStrip(els.loginStatus, result.error?.message || "Supervisor setup failed.", "error");
    return;
  }

  setStatusStrip(els.loginStatus, "Supervisor created. You can login now.", "success");
  els.seedForm.reset();
};

const submitOverride = async ({ passCode, action, note }) => {
  const { response, payload, networkError } = await api("/api/admin-override", {
    method: "POST",
    body: JSON.stringify({ passCode, action, note })
  });

  if (networkError) {
    setStatusStrip(els.overrideStatus, networkError, "error");
    return;
  }

  if (!response || !response.ok || !payload.ok) {
    setStatusStrip(els.overrideStatus, payload.error?.message || "Override failed.", "error");
    return;
  }

  setStatusStrip(els.overrideStatus, "Override applied.", "success");
  await loadScanHistory();
};

const createAdminAccount = async ({ fullName, email, password, role }) => {
  const { response, payload, networkError } = await api("/api/admin-users", {
    method: "POST",
    body: JSON.stringify({ fullName, email, password, role })
  });

  if (networkError) {
    setStatusStrip(els.overrideStatus, networkError, "error");
    return;
  }

  if (!response || !response.ok || !payload.ok) {
    setStatusStrip(els.overrideStatus, payload.error?.message || "Failed to create admin.", "error");
    return;
  }

  setStatusStrip(els.overrideStatus, "Admin account created.", "success");
  await loadAdminUsers();
};

const bindEvents = () => {
  els.loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    login({
      email: document.getElementById("loginEmail").value,
      password: document.getElementById("loginPassword").value
    });
  });

  els.seedForm.addEventListener("submit", (event) => {
    event.preventDefault();
    seedSupervisor({
      setupKey: document.getElementById("seedKey").value,
      fullName: document.getElementById("seedName").value,
      email: document.getElementById("seedEmail").value,
      password: document.getElementById("seedPassword").value
    });
  });

  els.logoutButton.addEventListener("click", logout);
  els.startScannerButton.addEventListener("click", startScanner);
  els.stopScannerButton.addEventListener("click", stopScanner);

  els.manualForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const code = els.manualCodeInput.value.trim().toUpperCase();
    if (!code) {
      return;
    }
    redeemScannedValue(code, "manual");
    els.manualCodeInput.value = "";
  });

  els.overrideForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitOverride({
      passCode: document.getElementById("overridePassCode").value.trim().toUpperCase(),
      action: document.getElementById("overrideAction").value,
      note: document.getElementById("overrideNote").value.trim()
    });
  });

  els.createAdminForm.addEventListener("submit", (event) => {
    event.preventDefault();
    createAdminAccount({
      fullName: document.getElementById("newAdminName").value.trim(),
      email: document.getElementById("newAdminEmail").value.trim(),
      password: document.getElementById("newAdminPassword").value,
      role: document.getElementById("newAdminRole").value
    });
    els.createAdminForm.reset();
  });
};

const bootstrap = async () => {
  bindEvents();
  renderAdminState();

  const { response, payload, networkError } = await api("/api/admin-me");
  if (networkError) {
    setStatusStrip(els.loginStatus, networkError, "error");
    setScanResult({
      code: "api_offline",
      category: "error",
      message: "Cannot reach admin API."
    });
    return;
  }

  if (!response || !response.ok || !payload.ok) {
    setStatusStrip(els.loginStatus, payload.error?.message || "Login to start scanning.");
    setScanResult({
      code: "ready",
      category: "neutral",
      message: "Awaiting admin session."
    });
    return;
  }

  state.admin = payload.admin;
  state.event = payload.event;
  renderAdminState();
  setStatusStrip(els.loginStatus, "Session restored.", "success");
  await loadScanHistory();
  await loadAdminUsers();
  state.historyRefreshHandle = window.setInterval(loadScanHistory, 5000);
};

bootstrap();
