const { getAdminSessionFromRequest } = require("./auth");
const { sendError } = require("./responses");

const requireMethod = (req, res, allowedMethod) => {
  if (req.method !== allowedMethod) {
    return false;
  }

  return true;
};

const requireAdminSession = (req, res) => {
  const session = getAdminSessionFromRequest(req);
  if (!session) {
    sendError(res, 401, "Admin authentication required.");
    return null;
  }

  return session;
};

const requireSupervisor = (req, res) => {
  const session = requireAdminSession(req, res);
  if (!session) {
    return null;
  }

  if (session.role !== "supervisor") {
    sendError(res, 403, "Supervisor role required.");
    return null;
  }

  return session;
};

module.exports = {
  requireAdminSession,
  requireMethod,
  requireSupervisor
};
