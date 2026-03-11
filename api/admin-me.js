const { methodNotAllowed, sendError, sendOk } = require("./_lib/responses");
const { getAdminSessionFromRequest } = require("./_lib/auth");
const { findAdminById } = require("./_lib/admin-repository");
const { toPublicAdmin, toPublicEvent } = require("./_lib/serializers");
const { getEvent } = require("./_lib/event");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return methodNotAllowed(req, res, ["GET"]);
  }

  try {
    const session = getAdminSessionFromRequest(req);
    if (!session) {
      return sendError(res, 401, "Admin session not found.");
    }

    const admin = await findAdminById(session.sub);
    if (!admin || !admin.is_active) {
      return sendError(res, 401, "Admin session is invalid.");
    }

    const event = await getEvent();
    return sendOk(res, {
      admin: toPublicAdmin(admin),
      event: toPublicEvent(event)
    });
  } catch (error) {
    return sendError(res, 500, "Failed to load admin session.", error.message);
  }
};
