const QRCode = require("qrcode");

const generateQrDataUrl = async (text, size = 164) =>
  QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    color: {
      dark: "#141414",
      light: "#FFFFFF"
    }
  });

module.exports = {
  generateQrDataUrl
};
