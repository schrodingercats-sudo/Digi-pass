const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const { createClient } = require("@supabase/supabase-js");

const loadEnvFromFile = () => {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    throw new Error(".env file not found.");
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    if (!line || line.trim().startsWith("#")) {
      return;
    }
    const index = line.indexOf("=");
    if (index <= 0) {
      return;
    }
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
};

const createMockResponse = () => {
  const state = {
    statusCode: 200,
    headers: {},
    json: null
  };

  const res = {
    setHeader: (key, value) => {
      state.headers[key.toLowerCase()] = value;
    },
    status: (code) => {
      state.statusCode = code;
      return res;
    },
    json: (payload) => {
      state.json = payload;
      return res;
    }
  };

  return {
    res,
    state
  };
};

const callHandler = async (handler, reqData) => {
  const { res, state } = createMockResponse();
  const req = {
    method: reqData.method || "GET",
    query: reqData.query || {},
    body: reqData.body || {},
    headers: reqData.headers || {},
    socket: {
      remoteAddress: "127.0.0.1"
    }
  };

  await handler(req, res);
  return {
    statusCode: state.statusCode,
    headers: state.headers,
    body: state.json
  };
};

const ensureSmokeSupervisor = async () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase URL or server key.");
  }

  const client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const passwordHash = await bcrypt.hash("PassDigi!123", 12);
  const { error } = await client.from("admin_users").upsert(
    {
      full_name: "Smoke Supervisor",
      email: "smoke.supervisor@passdigi.local",
      password_hash: passwordHash,
      role: "supervisor",
      is_active: true
    },
    { onConflict: "email" }
  );

  if (error) {
    throw new Error(`Failed to prepare supervisor: ${error.message}`);
  }
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const run = async () => {
  loadEnvFromFile();

  const registerHandler = require("../api/pass-register");
  const passStatusHandler = require("../api/pass-status");
  const adminLoginHandler = require("../api/admin-login");
  const adminRedeemHandler = require("../api/admin-redeem");
  const adminHistoryHandler = require("../api/admin-history");

  await ensureSmokeSupervisor();

  const stamp = Date.now();
  const registration = await callHandler(registerHandler, {
    method: "POST",
    body: {
      name: `Smoke User ${stamp}`,
      email: `user${stamp}@passdigi.local`,
      phone: `9${String(stamp).slice(-9)}`
    }
  });

  assert(registration.statusCode === 200, `Expected 200 from pass-register, got ${registration.statusCode}`);
  assert(registration.body?.ok === true, "pass-register returned ok=false");
  assert(Boolean(registration.body?.pass?.passCode), "pass-register missing passCode");
  assert(Boolean(registration.body?.passToken), "pass-register missing passToken");

  const token = registration.body.passToken;
  const passCode = registration.body.pass.passCode;

  const statusBeforeRedeem = await callHandler(passStatusHandler, {
    method: "GET",
    query: { token }
  });
  assert(statusBeforeRedeem.statusCode === 200, `Expected 200 from pass-status, got ${statusBeforeRedeem.statusCode}`);
  assert(statusBeforeRedeem.body?.pass?.status === "active", `Expected active status, got ${statusBeforeRedeem.body?.pass?.status}`);

  const adminLogin = await callHandler(adminLoginHandler, {
    method: "POST",
    body: {
      email: "smoke.supervisor@passdigi.local",
      password: "PassDigi!123"
    }
  });

  assert(adminLogin.statusCode === 200, `Expected 200 from admin-login, got ${adminLogin.statusCode}`);
  assert(adminLogin.body?.ok === true, "admin-login returned ok=false");
  const cookieHeader = adminLogin.headers["set-cookie"];
  assert(Boolean(cookieHeader), "admin-login did not set session cookie");
  const sessionCookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
  const cookiePair = String(sessionCookie).split(";")[0];

  const firstRedeem = await callHandler(adminRedeemHandler, {
    method: "POST",
    body: {
      scannedValue: passCode,
      scanChannel: "manual"
    },
    headers: {
      cookie: cookiePair,
      "user-agent": "smoke-test"
    }
  });

  assert(firstRedeem.statusCode === 200, `Expected 200 from admin-redeem #1, got ${firstRedeem.statusCode}`);
  assert(firstRedeem.body?.result?.code === "redeemed", `Expected redeemed code, got ${firstRedeem.body?.result?.code}`);

  const secondRedeem = await callHandler(adminRedeemHandler, {
    method: "POST",
    body: {
      scannedValue: passCode,
      scanChannel: "manual"
    },
    headers: {
      cookie: cookiePair,
      "user-agent": "smoke-test"
    }
  });

  assert(secondRedeem.statusCode === 409, `Expected 409 from admin-redeem #2, got ${secondRedeem.statusCode}`);
  assert(
    secondRedeem.body?.result?.code === "already_redeemed",
    `Expected already_redeemed code, got ${secondRedeem.body?.result?.code}`
  );

  const statusAfterRedeem = await callHandler(passStatusHandler, {
    method: "GET",
    query: { token }
  });
  assert(statusAfterRedeem.statusCode === 200, `Expected 200 from pass-status after redeem, got ${statusAfterRedeem.statusCode}`);
  assert(
    statusAfterRedeem.body?.pass?.status === "redeemed",
    `Expected redeemed status, got ${statusAfterRedeem.body?.pass?.status}`
  );

  const history = await callHandler(adminHistoryHandler, {
    method: "GET",
    query: { limit: "10" },
    headers: {
      cookie: cookiePair
    }
  });

  assert(history.statusCode === 200, `Expected 200 from admin-history, got ${history.statusCode}`);
  assert(history.body?.ok === true, "admin-history returned ok=false");
  assert(Array.isArray(history.body?.logs), "admin-history logs is not an array");

  return {
    passCode,
    statusBefore: statusBeforeRedeem.body.pass.status,
    statusAfter: statusAfterRedeem.body.pass.status,
    secondScanCode: secondRedeem.body.result.code,
    logCount: history.body.logs.length
  };
};

run()
  .then((result) => {
    // Keeping output structured helps quick manual inspection.
    console.log(JSON.stringify({ ok: true, result }, null, 2));
  })
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
  });
