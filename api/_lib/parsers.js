const crypto = require("node:crypto");

const normalizeEmail = (email) => email.trim().toLowerCase();

const normalizePhone = (phone) => {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  return `${hasPlus ? "+" : ""}${digits}`;
};

const PASS_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const generatePassCode = () => {
  const randomBytes = crypto.randomBytes(8);
  const chars = [];
  for (let i = 0; i < 8; i += 1) {
    chars.push(PASS_CODE_CHARS[randomBytes[i] % PASS_CODE_CHARS.length]);
  }
  return `PD-${chars.join("")}`;
};

const isPassCode = (value) => /^PD-[A-Z0-9]{8}$/.test(value.trim().toUpperCase());

const parseScannedValue = (input) => {
  const raw = String(input || "").trim();

  if (!raw) {
    return { type: "empty" };
  }

  if (raw.startsWith("PDG:")) {
    return { type: "token", value: raw.replace(/^PDG:/, "").trim() };
  }

  try {
    const maybeUrl = new URL(raw);
    const token = maybeUrl.searchParams.get("token");
    const code = maybeUrl.searchParams.get("code");

    if (token) {
      return { type: "token", value: token.trim() };
    }

    if (code) {
      return { type: "code", value: code.trim().toUpperCase() };
    }
  } catch (error) {
    // Intentional no-op. Not a URL.
  }

  if (isPassCode(raw)) {
    return { type: "code", value: raw.toUpperCase() };
  }

  const looksLikeToken = raw.split(".").length === 3;
  if (looksLikeToken) {
    return { type: "token", value: raw };
  }

  return { type: "unknown", value: raw };
};

module.exports = {
  generatePassCode,
  normalizeEmail,
  normalizePhone,
  parseScannedValue
};
