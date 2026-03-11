const readRequiredEnv = (key) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const readRequiredEnvFrom = (keys, label) => {
  const found = keys.find((key) => process.env[key]);
  if (!found) {
    throw new Error(`Missing required environment variable: ${label}. Tried: ${keys.join(", ")}`);
  }
  return process.env[found];
};

const config = {
  supabaseUrl: readRequiredEnv("SUPABASE_URL"),
  supabaseServiceRoleKey: readRequiredEnvFrom(
    ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"],
    "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY"
  ),
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || "",
  passTokenSecret: readRequiredEnv("PASS_TOKEN_SECRET"),
  adminJwtSecret: readRequiredEnv("ADMIN_JWT_SECRET"),
  adminSetupKey: readRequiredEnv("ADMIN_SETUP_KEY"),
  adminSessionCookieName: "passdigi_admin_session",
  adminSessionHours: 16,
  eventSlug: process.env.EVENT_SLUG || "default-event",
  isProduction: process.env.NODE_ENV === "production"
};

module.exports = { config };
