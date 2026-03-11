const { methodNotAllowed, sendError, sendOk } = require("./_lib/responses");
const { requireAdminSession } = require("./_lib/guards");
const { getEvent } = require("./_lib/event");
const { listRecentScanLogs } = require("./_lib/pass-repository");

module.exports = async (req, res) => {
  const session = requireAdminSession(req, res);
  if (!session) {
    return undefined;
  }

  if (req.method !== "GET") {
    return methodNotAllowed(req, res, ["GET"]);
  }

  try {
    const event = await getEvent();
    const limit = Number.parseInt(String(req.query.limit || "30"), 10);
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 5), 100) : 30;
    const rows = await listRecentScanLogs({
      eventId: event.id,
      limit: safeLimit
    });

    return sendOk(res, {
      logs: rows
    });
  } catch (error) {
    return sendError(res, 500, "Failed to load scan history.", error.message);
  }
};
