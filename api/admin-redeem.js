const { methodNotAllowed, sendError, sendOk } = require("./_lib/responses");
const { requireAdminSession } = require("./_lib/guards");
const { redeemSchema } = require("./_lib/validators");
const { readJsonBody, getRequesterIp } = require("./_lib/request");
const { parseScannedValue } = require("./_lib/parsers");
const { verifyPassToken } = require("./_lib/pass-token");
const { getEvent } = require("./_lib/event");
const {
  findPassByCode,
  findPassById,
  insertScanLog,
  markPassExpiredIfNeeded,
  redeemPassIfActive
} = require("./_lib/pass-repository");
const { toPublicPass } = require("./_lib/serializers");

const scanResponse = ({ category, code, message, pass }) => ({
  result: {
    category,
    code,
    message
  },
  ...(pass ? { pass: toPublicPass(pass) } : { pass: null })
});

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
    const parsedInput = redeemSchema.safeParse(body);
    if (!parsedInput.success) {
      return sendError(res, 400, "Invalid scan input.", parsedInput.error.flatten());
    }

    const rawScannedValue = parsedInput.data.manualCode || parsedInput.data.scannedValue || "";
    const parsedScan = parseScannedValue(rawScannedValue);
    const event = await getEvent();
    const requesterIp = getRequesterIp(req);
    const requesterUserAgent = req.headers["user-agent"] || "unknown";
    const scanChannel = parsedInput.data.scanChannel;

    if (parsedScan.type === "empty" || parsedScan.type === "unknown") {
      await insertScanLog({
        eventId: event.id,
        adminId: session.sub,
        adminNameSnapshot: session.name,
        inputValue: rawScannedValue || "<empty>",
        scanChannel,
        result: "invalid_input",
        reason: "Could not parse QR payload or pass code.",
        requesterIp,
        requesterUserAgent
      });

      return sendOk(res, scanResponse({
        category: "error",
        code: "invalid_input",
        message: "Invalid scan. Use a PassDigi QR or pass code."
      }), 400);
    }

    let pass = null;

    if (parsedScan.type === "token") {
      const tokenResult = verifyPassToken(parsedScan.value);
      if (!tokenResult.valid) {
        await insertScanLog({
          eventId: event.id,
          adminId: session.sub,
          adminNameSnapshot: session.name,
          inputValue: rawScannedValue,
          scanChannel,
          result: "invalid_token",
          reason: "Token verification failed.",
          requesterIp,
          requesterUserAgent
        });

        return sendOk(res, scanResponse({
          category: "error",
          code: "invalid_token",
          message: "Invalid or expired QR token."
        }), 401);
      }

      if (tokenResult.payload.es !== event.event_slug) {
        await insertScanLog({
          eventId: event.id,
          adminId: session.sub,
          adminNameSnapshot: session.name,
          inputValue: rawScannedValue,
          scanChannel,
          result: "wrong_event",
          reason: "Token event slug does not match active event.",
          requesterIp,
          requesterUserAgent
        });

        return sendOk(res, scanResponse({
          category: "error",
          code: "wrong_event",
          message: "This pass belongs to a different event."
        }), 400);
      }

      pass = await findPassById({
        eventId: event.id,
        passId: tokenResult.payload.pid
      });
    } else if (parsedScan.type === "code") {
      pass = await findPassByCode({
        eventId: event.id,
        passCode: parsedScan.value
      });
    }

    if (!pass) {
      await insertScanLog({
        eventId: event.id,
        adminId: session.sub,
        adminNameSnapshot: session.name,
        inputValue: rawScannedValue,
        scanChannel,
        result: "not_found",
        reason: "Pass record not found.",
        requesterIp,
        requesterUserAgent
      });

      return sendOk(res, scanResponse({
        category: "error",
        code: "not_found",
        message: "Pass not found."
      }), 404);
    }

    pass = await markPassExpiredIfNeeded({
      pass,
      eventId: event.id
    });

    const nowMs = Date.now();
    const eventStartMs = new Date(event.starts_at).getTime();
    const eventEndMs = new Date(event.ends_at).getTime();

    const logBase = {
      eventId: event.id,
      passId: pass.id,
      passCodeSnapshot: pass.pass_code,
      attendeeNameSnapshot: pass.attendee_name,
      adminId: session.sub,
      adminNameSnapshot: session.name,
      inputValue: rawScannedValue,
      scanChannel,
      requesterIp,
      requesterUserAgent
    };

    if (nowMs < eventStartMs) {
      await insertScanLog({
        ...logBase,
        result: "too_early",
        reason: "Event has not started yet."
      });

      return sendOk(res, scanResponse({
        category: "warning",
        code: "too_early",
        message: "Event entry has not started yet.",
        pass
      }), 409);
    }

    if (nowMs > eventEndMs) {
      await insertScanLog({
        ...logBase,
        result: "event_closed",
        reason: "Event end time already passed."
      });

      return sendOk(res, scanResponse({
        category: "warning",
        code: "event_closed",
        message: "Event is closed. Entry is not allowed now.",
        pass
      }), 409);
    }

    if (pass.status === "redeemed") {
      await insertScanLog({
        ...logBase,
        result: "already_redeemed",
        reason: "Pass has already been redeemed."
      });

      return sendOk(res, scanResponse({
        category: "warning",
        code: "already_redeemed",
        message: "Pass already used.",
        pass
      }), 409);
    }

    if (pass.status === "revoked") {
      await insertScanLog({
        ...logBase,
        result: "revoked",
        reason: "Pass was revoked by admin."
      });

      return sendOk(res, scanResponse({
        category: "error",
        code: "revoked",
        message: "Pass was revoked.",
        pass
      }), 409);
    }

    if (pass.status === "expired") {
      await insertScanLog({
        ...logBase,
        result: "expired",
        reason: "Pass expired before scan."
      });

      return sendOk(res, scanResponse({
        category: "error",
        code: "expired",
        message: "Pass expired.",
        pass
      }), 409);
    }

    const redeemedPass = await redeemPassIfActive({
      passId: pass.id,
      eventId: event.id,
      adminId: session.sub
    });

    if (!redeemedPass) {
      const latestPass = await findPassById({
        eventId: event.id,
        passId: pass.id
      });

      await insertScanLog({
        ...logBase,
        result: "already_redeemed",
        reason: "Concurrent scan redeemed this pass first."
      });

      return sendOk(res, scanResponse({
        category: "warning",
        code: "already_redeemed",
        message: "Pass already used by another scan.",
        pass: latestPass || pass
      }), 409);
    }

    await insertScanLog({
      ...logBase,
      result: "redeemed",
      reason: "Pass redeemed successfully."
    });

    return sendOk(res, scanResponse({
      category: "success",
      code: "redeemed",
      message: "Pass verified. Entry allowed.",
      pass: redeemedPass
    }));
  } catch (error) {
    return sendError(res, 500, "Failed to verify pass.", error.message);
  }
};
