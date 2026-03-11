const { getEvent } = require("./_lib/event");
const { verifyPassToken } = require("./_lib/pass-token");
const { findPassById, markPassExpiredIfNeeded } = require("./_lib/pass-repository");
const { methodNotAllowed, sendError, sendOk } = require("./_lib/responses");
const { toPublicEvent, toPublicPass } = require("./_lib/serializers");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return methodNotAllowed(req, res, ["GET"]);
  }

  try {
    const token = String(req.query.token || "").trim();
    if (!token) {
      return sendError(res, 400, "Missing pass token.");
    }

    const tokenResult = verifyPassToken(token);
    if (!tokenResult.valid) {
      return sendError(res, 401, "Invalid or expired pass token.");
    }

    const event = await getEvent();

    if (tokenResult.payload.es !== event.event_slug) {
      return sendError(res, 401, "Pass token does not match this event.");
    }

    const pass = await findPassById({
      eventId: event.id,
      passId: tokenResult.payload.pid
    });

    if (!pass) {
      return sendError(res, 404, "Pass not found.");
    }

    const updatedPass = await markPassExpiredIfNeeded({
      pass,
      eventId: event.id
    });

    return sendOk(res, {
      event: toPublicEvent(event),
      pass: toPublicPass(updatedPass),
      tokenState: {
        eventSlug: tokenResult.payload.es,
        tokenVersion: tokenResult.payload.tv
      }
    });
  } catch (error) {
    return sendError(res, 500, "Failed to fetch pass status.", error.message);
  }
};
