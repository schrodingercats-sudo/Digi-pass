const { parse, serialize } = require("cookie");
const { config } = require("./config");

const parseCookies = (req) => {
  const cookieHeader = req.headers.cookie || "";
  return parse(cookieHeader);
};

const serializeAdminSessionCookie = (sessionToken) =>
  serialize(config.adminSessionCookieName, sessionToken, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: config.adminSessionHours * 60 * 60
  });

const serializeClearedAdminSessionCookie = () =>
  serialize(config.adminSessionCookieName, "", {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });

module.exports = {
  parseCookies,
  serializeAdminSessionCookie,
  serializeClearedAdminSessionCookie
};
