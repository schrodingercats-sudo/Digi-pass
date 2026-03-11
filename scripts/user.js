const PASS_STORAGE_KEY = "passdigi.user.session.v1";
const PASS_COOKIE_KEY = "passdigi_user_token";
const STATUS_POLL_MS = 1000;
const LOCAL_API_ORIGIN = "http://127.0.0.1:3000";
const LOCALHOST_API_ORIGIN = "http://localhost:3000";

const state = {
  event: null,
  pass: null,
  passToken: null,
  qrPayload: null,
  qrImageDataUrl: null,
  pollHandle: null,
  redeemedOverlayShown: false
};

const els = {
  registrationForm: document.getElementById("registrationForm"),
  registerButton: document.getElementById("registerButton"),
  registrationStatus: document.getElementById("registrationStatus"),
  passStatus: document.getElementById("passStatus"),
  passStatePill: document.getElementById("passStatePill"),
  passName: document.getElementById("passName"),
  passEmail: document.getElementById("passEmail"),
  passPhone: document.getElementById("passPhone"),
  passCode: document.getElementById("passCode"),
  qrCanvasWrap: document.getElementById("qrCanvasWrap"),
  eventNameLine: document.getElementById("eventNameLine"),
  eventVenueLine: document.getElementById("eventVenueLine"),
  eventTimeLine: document.getElementById("eventTimeLine"),
  refreshStatusButton: document.getElementById("refreshStatusButton"),
  downloadPassButton: document.getElementById("downloadPassButton"),
  clearLocalButton: document.getElementById("clearLocalButton"),
  ticketCard: document.getElementById("ticketCard"),
  verifyOverlay: document.getElementById("verifyOverlay")
};

const api = async (url, options = {}) => {
  const resolveApiCandidates = (inputUrl) => {
    if (/^https?:\/\//i.test(inputUrl)) {
      return [inputUrl];
    }

    const candidates = [];
    if (window.location.origin && /^https?:/i.test(window.location.origin)) {
      candidates.push(`${window.location.origin}${inputUrl}`);
    }
    candidates.push(`${LOCAL_API_ORIGIN}${inputUrl}`);
    candidates.push(`${LOCALHOST_API_ORIGIN}${inputUrl}`);
    return [...new Set(candidates)];
  };

  const candidates = resolveApiCandidates(url);
  const attempted = [];

  for (const candidateUrl of candidates) {
    try {
      const response = await fetch(candidateUrl, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        }
      });

      let payload = {};
      let rawText = "";

      try {
        payload = await response.clone().json();
      } catch (error) {
        rawText = await response.text().catch(() => "");
      }

      attempted.push(`${candidateUrl} -> ${response.status}`);

      const isMethodOrMissing = response.status === 404 || response.status === 405;
      const canTryNext = isMethodOrMissing && candidateUrl !== candidates[candidates.length - 1];
      if (canTryNext) {
        continue;
      }

      return { response, payload, rawText, networkError: null, apiUrl: candidateUrl, attempted };
    } catch (error) {
      attempted.push(`${candidateUrl} -> network_error(${error?.message || "failed"})`);
    }
  }

  return {
    response: null,
    payload: {},
    rawText: "",
    networkError: `Failed to fetch. Tried: ${attempted.join(" | ")}`,
    apiUrl: null,
    attempted
  };
};

const getApiCandidates = (url) => {
  if (/^https?:\/\//i.test(url)) {
    return [url];
  }

  const candidates = [];
  if (window.location.origin && /^https?:/i.test(window.location.origin)) {
    candidates.push(`${window.location.origin}${url}`);
  }
  candidates.push(`${LOCAL_API_ORIGIN}${url}`);
  candidates.push(`${LOCALHOST_API_ORIGIN}${url}`);
  return [...new Set(candidates)];
};

const setStrip = (element, text, tone = "neutral") => {
  element.textContent = text;
  element.dataset.tone = tone;
  const toneMap = {
    success: "var(--green)",
    warning: "var(--amber)",
    error: "var(--red)"
  };
  element.style.color = toneMap[tone] || "var(--muted)";
};

const setCookie = (name, value, maxAgeSeconds) => {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure}`;
};

const getCookie = (name) => {
  const matches = document.cookie.split(";").map((part) => part.trim());
  const found = matches.find((cookieLine) => cookieLine.startsWith(`${name}=`));
  if (!found) {
    return null;
  }
  return decodeURIComponent(found.split("=").slice(1).join("="));
};

const clearCookie = (name) => {
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
};

const formatEventWindow = (event) => {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const formatter = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  });
  return `${formatter.format(start)} to ${formatter.format(end)} (${event.timezone})`;
};

const persistSession = () => {
  if (!state.passToken) {
    return;
  }

  const payload = {
    passToken: state.passToken,
    qrPayload: state.qrPayload,
    qrImageDataUrl: state.qrImageDataUrl,
    pass: state.pass,
    event: state.event
  };

  localStorage.setItem(PASS_STORAGE_KEY, JSON.stringify(payload));
  setCookie(PASS_COOKIE_KEY, state.passToken, 60 * 60 * 24 * 7);
};

const clearSession = () => {
  localStorage.removeItem(PASS_STORAGE_KEY);
  clearCookie(PASS_COOKIE_KEY);
  state.event = null;
  state.pass = null;
  state.passToken = null;
  state.qrPayload = null;
  state.qrImageDataUrl = null;
  state.redeemedOverlayShown = false;
  renderPass();
  setStrip(els.passStatus, "Local pass cleared.");
};

const loadSession = () => {
  const fromStorage = localStorage.getItem(PASS_STORAGE_KEY);
  if (!fromStorage) {
    return null;
  }

  try {
    return JSON.parse(fromStorage);
  } catch (error) {
    return null;
  }
};

const renderQr = async () => {
  if (!state.qrPayload) {
    els.qrCanvasWrap.innerHTML = "";
    return;
  }

  els.qrCanvasWrap.innerHTML = "";

  const loadImage = (src) =>
    new Promise((resolve) => {
      const image = document.createElement("img");
      image.alt = "Pass QR code";
      image.width = 156;
      image.height = 156;
      image.decoding = "async";
      image.loading = "eager";

      const done = (ok) => resolve({ ok, image });
      const timeoutHandle = window.setTimeout(() => done(false), 4000);
      image.onload = () => {
        window.clearTimeout(timeoutHandle);
        done(true);
      };
      image.onerror = () => {
        window.clearTimeout(timeoutHandle);
        done(false);
      };
      image.src = src;
    });

  // Path 1: use QR data URL embedded in pass-register response.
  if (state.qrImageDataUrl) {
    const inlineResult = await loadImage(state.qrImageDataUrl);
    if (inlineResult.ok) {
      els.qrCanvasWrap.appendChild(inlineResult.image);
      return;
    }
  }

  // Path 2: try API QR image on candidate origins.
  const qrPath = `/api/qr?size=164&text=${encodeURIComponent(state.qrPayload)}`;
  const qrUrlCandidates = getApiCandidates(qrPath);
  for (const candidate of qrUrlCandidates) {
    const candidateResult = await loadImage(candidate);
    if (candidateResult.ok) {
      els.qrCanvasWrap.appendChild(candidateResult.image);
      if (!state.qrImageDataUrl) {
        state.qrImageDataUrl = candidate;
      }
      return;
    }
  }

  // Path 3: client-side library rendering if available.
  if (window.QRCode && typeof window.QRCode.toCanvas === "function") {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 164;
      canvas.height = 164;
      els.qrCanvasWrap.appendChild(canvas);
      await window.QRCode.toCanvas(canvas, state.qrPayload, {
        margin: 1,
        width: 164,
        color: {
          dark: "#141414",
          light: "#ffffff"
        }
      });
      return;
    } catch (error) {
      // If canvas fallback fails, show explicit message below.
    }
  }

  // Final fallback.
  const failText = document.createElement("p");
  failText.className = "tiny-text";
  failText.textContent = "QR unavailable. Use code below.";
  els.qrCanvasWrap.appendChild(failText);
};

const renderPass = async () => {
  const pass = state.pass;
  const event = state.event;

  if (!pass || !event) {
    els.passName.textContent = "-";
    els.passEmail.textContent = "-";
    els.passPhone.textContent = "-";
    els.passCode.textContent = "PASS CODE: -";
    els.eventNameLine.textContent = "Event: -";
    els.eventVenueLine.textContent = "Venue: -";
    els.eventTimeLine.textContent = "Window: -";
    els.passStatePill.textContent = "Not Issued";
    els.passStatePill.className = "state-pill";
    await renderQr();
    return;
  }

  els.passName.textContent = pass.name;
  els.passEmail.textContent = pass.email;
  els.passPhone.textContent = pass.phone;
  els.passCode.textContent = `PASS CODE: ${pass.passCode}`;
  els.eventNameLine.textContent = `Event: ${event.eventName}`;
  els.eventVenueLine.textContent = `Venue: ${event.venue}`;
  els.eventTimeLine.textContent = `Window: ${formatEventWindow(event)}`;
  els.passStatePill.textContent = pass.status.toUpperCase();
  els.passStatePill.className = `state-pill ${pass.status}`;
  await renderQr();
};

const triggerVerifiedOverlay = () => {
  if (state.redeemedOverlayShown) {
    return;
  }

  state.redeemedOverlayShown = true;
  els.verifyOverlay.classList.remove("hidden");
  els.verifyOverlay.setAttribute("aria-hidden", "false");

  if (typeof confetti === "function") {
    confetti({
      particleCount: 140,
      spread: 110,
      origin: { y: 0.6 }
    });
  }

  setTimeout(() => {
    els.verifyOverlay.classList.add("hidden");
    els.verifyOverlay.setAttribute("aria-hidden", "true");
  }, 2900);
};

const applyServerPassState = async ({ event, pass, passToken, qrPayload, qrImageDataUrl }) => {
  const previousStatus = state.pass?.status;
  state.event = event;
  state.pass = pass;
  state.passToken = passToken || state.passToken;
  state.qrPayload = qrPayload || state.qrPayload;
  state.qrImageDataUrl = qrImageDataUrl || state.qrImageDataUrl;
  persistSession();
  await renderPass();

  if (previousStatus !== "redeemed" && pass.status === "redeemed") {
    triggerVerifiedOverlay();
    setStrip(els.passStatus, "Pass redeemed successfully. Entry confirmed.", "success");
    return;
  }

  if (pass.status === "active") {
    setStrip(els.passStatus, "Pass is active and ready for scanning.", "success");
  } else if (pass.status === "redeemed") {
    setStrip(els.passStatus, "Pass already used.", "warning");
  } else {
    setStrip(els.passStatus, `Pass status: ${pass.status}.`, "warning");
  }
};

const refreshPassStatus = async () => {
  if (!state.passToken) {
    return;
  }

  const { response, payload } = await api(`/api/pass-status?token=${encodeURIComponent(state.passToken)}`);
  if (!response.ok || !payload.ok) {
    setStrip(els.passStatus, payload.error?.message || "Unable to refresh pass status.", "error");
    return;
  }

  await applyServerPassState({
    event: payload.event,
    pass: payload.pass
  });
};

const startStatusPolling = () => {
  if (state.pollHandle) {
    window.clearInterval(state.pollHandle);
  }

  state.pollHandle = window.setInterval(() => {
    if (document.visibilityState === "visible") {
      refreshPassStatus();
    }
  }, STATUS_POLL_MS);
};

const registerPass = async (formData) => {
  els.registerButton.disabled = true;
  setStrip(els.registrationStatus, "Creating your pass...");

  const { response, payload, rawText, networkError } = await api("/api/pass-register", {
    method: "POST",
    body: JSON.stringify(formData)
  });

  els.registerButton.disabled = false;

  if (networkError) {
    const isLikelyMixedContent = window.location.protocol === "https:";
    const hint = isLikelyMixedContent
      ? " Open app on http://127.0.0.1:3000/index.html."
      : "";
    setStrip(els.registrationStatus, `Network error: ${networkError}.${hint}`, "error");
    return;
  }

  if (!response || !response.ok || !payload.ok) {
    if (response?.status === 405) {
      setStrip(
        els.registrationStatus,
        "Method not allowed from current server. Run `npm run dev` and open http://127.0.0.1:3000/index.html",
        "error"
      );
      return;
    }

    const genericByStatus = response?.status >= 500
      ? `Server error (${response.status}). Check API logs/env vars.`
      : `Request failed (${response?.status || "unknown"}).`;
    const backendMessage = payload.error?.message || (rawText && rawText.slice(0, 140));
    setStrip(els.registrationStatus, backendMessage || genericByStatus, "error");
    return;
  }

  try {
    await applyServerPassState({
      event: payload.event,
      pass: payload.pass,
      passToken: payload.passToken,
      qrPayload: payload.qrPayload,
      qrImageDataUrl: payload.qrImageDataUrl
    });
  } catch (error) {
    setStrip(els.registrationStatus, `Pass created but render failed: ${error.message}`, "warning");
    return;
  }

  const message = payload.isExisting
    ? "Existing pass restored for this email/phone."
    : "Pass generated successfully.";
  setStrip(els.registrationStatus, message, "success");
};

const downloadPassCard = async () => {
  if (!state.pass) {
    setStrip(els.passStatus, "No pass available to download.", "warning");
    return;
  }

  const canvas = await html2canvas(els.ticketCard, {
    backgroundColor: "#fffdf6",
    scale: 2
  });

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `${state.pass.passCode}.png`;
  link.click();
  setStrip(els.passStatus, "Pass image downloaded.", "success");
};

const bootFromSavedSession = async () => {
  const saved = loadSession();
  const cookieToken = getCookie(PASS_COOKIE_KEY);

  if (saved?.passToken) {
    state.passToken = saved.passToken;
    state.qrPayload = saved.qrPayload;
    state.qrImageDataUrl = saved.qrImageDataUrl || null;
    state.pass = saved.pass;
    state.event = saved.event;
    await renderPass();
  } else if (cookieToken) {
    state.passToken = cookieToken;
    state.qrPayload = `PDG:${cookieToken}`;
  }

  if (state.passToken) {
    await refreshPassStatus();
  }
};

const handleRegistrationSubmit = (event) => {
  event.preventDefault();
  const formData = {
    name: document.getElementById("nameInput").value,
    email: document.getElementById("emailInput").value,
    phone: document.getElementById("phoneInput").value
  };
  registerPass(formData);
};

const init = async () => {
  els.registrationForm.addEventListener("submit", handleRegistrationSubmit);
  els.refreshStatusButton.addEventListener("click", refreshPassStatus);
  els.downloadPassButton.addEventListener("click", downloadPassCard);
  els.clearLocalButton.addEventListener("click", clearSession);

  await bootFromSavedSession();
  startStatusPolling();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshPassStatus();
    }
  });
  window.addEventListener("focus", refreshPassStatus);
  setStrip(els.registrationStatus, "Fill the form to generate your pass.");
  if (!state.pass) {
    setStrip(els.passStatus, "No active pass found on this device.");
  }
};

init();
