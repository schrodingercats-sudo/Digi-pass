const jwt = require("jsonwebtoken");
const { config } = require("./config");
const { parseCookies } = require("./cookies");

const createAdminSessionToken = (admin) =>
  jwt.sign(
    {
      sub: admin.id,
      role: admin.role,
      email: admin.email,
      name: admin.full_name
    },
    config.adminJwtSecret,
    {
      algorithm: "HS256",
      expiresIn: `${config.adminSessionHours}h`
    }
  );

const getAdminSessionFromRequest = (req) => {
  const cookies = parseCookies(req);
  const sessionToken = cookies[config.adminSessionCookieName];

  if (!sessionToken) {
    return null;
  }

  try {
    return jwt.verify(sessionToken, config.adminJwtSecret);
  } catch (error) {
    return null;
  }
};

module.exports = {
  createAdminSessionToken,
  getAdminSessionFromRequest
};
