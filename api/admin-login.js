const bcrypt = require("bcryptjs");
const { adminLoginSchema } = require("./_lib/validators");
const { methodNotAllowed, sendError, sendOk } = require("./_lib/responses");
const { readJsonBody } = require("./_lib/request");
const { normalizeEmail } = require("./_lib/parsers");
const { findAdminByEmail, updateLastLogin } = require("./_lib/admin-repository");
const { createAdminSessionToken } = require("./_lib/auth");
const { serializeAdminSessionCookie } = require("./_lib/cookies");
const { getEvent } = require("./_lib/event");
const { toPublicAdmin, toPublicEvent } = require("./_lib/serializers");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return methodNotAllowed(req, res, ["POST"]);
  }

  try {
    const body = await readJsonBody(req);
    const parsedInput = adminLoginSchema.safeParse(body);

    if (!parsedInput.success) {
      return sendError(res, 400, "Invalid login input.", parsedInput.error.flatten());
    }

    const email = normalizeEmail(parsedInput.data.email);
    const admin = await findAdminByEmail(email);
    if (!admin || !admin.is_active) {
      return sendError(res, 401, "Invalid credentials.");
    }

    const passwordIsValid = await bcrypt.compare(parsedInput.data.password, admin.password_hash);
    if (!passwordIsValid) {
      return sendError(res, 401, "Invalid credentials.");
    }

    const sessionToken = createAdminSessionToken(admin);
    await updateLastLogin(admin.id);

    const event = await getEvent();
    return sendOk(
      res,
      {
        admin: toPublicAdmin(admin),
        event: toPublicEvent(event)
      },
      200,
      {
        "Set-Cookie": serializeAdminSessionCookie(sessionToken)
      }
    );
  } catch (error) {
    return sendError(res, 500, "Login failed.", error.message);
  }
};
