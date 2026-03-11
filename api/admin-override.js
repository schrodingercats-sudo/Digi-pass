const { methodNotAllowed, sendError, sendOk } = require("./_lib/responses");
const { requireAdminSession } = require("./_lib/guards");
const { readJsonBody, getRequesterIp } = require("./_lib/request");
const { overrideSchema } = require("./_lib/validators");
const { getEvent } = require("./_lib/event");
const { findPassByCode, insertScanLog, updatePass } = require("./_lib/pass-repository");
const { toPublicPass } = require("./_lib/serializers");

const applyOverride = async ({ eventId, pass, adminId, action, note }) => {
  if (action === "force_redeem") {
    return updatePass({
      passId: pass.id,
      eventId,
      patch: {
        status: "redeemed",
        redeemed_at: new Date().toISOString(),
        redeemed_by_admin_id: adminId,
        override_note: note
      }
    });
  }

  if (action === "revert_redemption") {
    return updatePass({
      passId: pass.id,
      eventId,
      patch: {
        status: "active",
        redeemed_at: null,
        redeemed_by_admin_id: null,
        override_note: note
      }
    });
  }

  return updatePass({
    passId: pass.id,
    eventId,
    patch: {
      status: "revoked",
      override_note: note
    }
  });
};

module.exports = async (req, res) => {
  const session = requireAdminSession(req, res);
  if (!session) {
    return undefined;
  }

  if (req.method !== "POST") {
    return methodNotAllowed(req, res, ["POST"]);
  }

  try {
    const body = await readJsonBody(req);
    const parsedInput = overrideSchema.safeParse({
      ...body,
      passCode: String(body.passCode || "").trim().toUpperCase()
    });

    if (!parsedInput.success) {
      return sendError(res, 400, "Invalid override input.", parsedInput.error.flatten());
    }

    const event = await getEvent();
    const pass = await findPassByCode({
      eventId: event.id,
      passCode: parsedInput.data.passCode
    });

    if (!pass) {
      return sendError(res, 404, "Pass not found.");
    }

    const updatedPass = await applyOverride({
      eventId: event.id,
      pass,
      adminId: session.sub,
      action: parsedInput.data.action,
      note: parsedInput.data.note
    });

    await insertScanLog({
      eventId: event.id,
      passId: updatedPass.id,
      passCodeSnapshot: updatedPass.pass_code,
      attendeeNameSnapshot: updatedPass.attendee_name,
      adminId: session.sub,
      adminNameSnapshot: session.name,
      inputValue: parsedInput.data.passCode,
      scanChannel: "manual",
      result: `override_${parsedInput.data.action}`,
      reason: parsedInput.data.note,
      requesterIp: getRequesterIp(req),
      requesterUserAgent: req.headers["user-agent"] || "unknown"
    });

    return sendOk(res, {
      message: "Override applied successfully.",
      pass: toPublicPass(updatedPass)
    });
  } catch (error) {
    return sendError(res, 500, "Failed to apply override.", error.message);
  }
};
