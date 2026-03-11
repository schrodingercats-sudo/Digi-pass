const { methodNotAllowed, sendError } = require("./_lib/responses");
const { generateQrDataUrl } = require("./_lib/qr");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return methodNotAllowed(req, res, ["GET"]);
  }

  try {
    const text = String(req.query.text || "").trim();
    const sizeRaw = Number.parseInt(String(req.query.size || "164"), 10);
    const size = Number.isFinite(sizeRaw) ? Math.min(Math.max(sizeRaw, 64), 512) : 164;

    if (!text) {
      return sendError(res, 400, "Missing QR text.");
    }

    const dataUrl = await generateQrDataUrl(text, size);
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
    const pngBuffer = Buffer.from(base64Data, "base64");

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.status(200).end(pngBuffer);
  } catch (error) {
    return sendError(res, 500, "Failed to generate QR image.", error.message);
  }
};
