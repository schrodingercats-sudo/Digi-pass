const jwt = require("jsonwebtoken");
const { config } = require("./config");

const createPassToken = ({ passId, passCode, eventSlug, expiresAt, tokenVersion }) =>
  jwt.sign(
    {
      pid: passId,
      pcd: passCode,
      es: eventSlug,
      tv: tokenVersion
    },
    config.passTokenSecret,
    {
      algorithm: "HS256",
      expiresIn: Math.max(1, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
    }
  );

const verifyPassToken = (token) => {
  try {
    const payload = jwt.verify(token, config.passTokenSecret);
    return { valid: true, payload };
  } catch (error) {
    return { valid: false, reason: error.message };
  }
};

module.exports = {
  createPassToken,
  verifyPassToken
};
