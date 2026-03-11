const { methodNotAllowed, sendOk } = require("./_lib/responses");
const { serializeClearedAdminSessionCookie } = require("./_lib/cookies");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return methodNotAllowed(req, res, ["POST"]);
  }

  return sendOk(
    res,
    { message: "Logged out." },
    200,
    {
      "Set-Cookie": serializeClearedAdminSessionCookie()
    }
  );
};
