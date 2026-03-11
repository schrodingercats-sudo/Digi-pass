const { registrationSchema } = require("./_lib/validators");
const { methodNotAllowed, sendError, sendOk } = require("./_lib/responses");
const { readJsonBody } = require("./_lib/request");
const { getEvent } = require("./_lib/event");
const { createPassToken } = require("./_lib/pass-token");
const { createPass, findPassByCode, findPassByEmailOrPhone } = require("./_lib/pass-repository");
const { generatePassCode, normalizeEmail, normalizePhone } = require("./_lib/parsers");
const { toPublicEvent, toPublicPass } = require("./_lib/serializers");
const { generateQrDataUrl } = require("./_lib/qr");

const findUniquePassCode = async ({ eventId, maxAttempts = 8 }) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const passCode = generatePassCode();
    const pass = await findPassByCode({ eventId, passCode });
    if (!pass) {
      return passCode;
    }
  }

  throw new Error("Could not generate a unique pass code.");
};

const createPassWithRetries = async ({ eventId, attendeeName, attendeeEmail, attendeePhone, expiresAt }) => {
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const passCode = await findUniquePassCode({ eventId });
      return await createPass({
        eventId,
        attendeeName,
        attendeeEmail,
        attendeePhone,
        passCode,
        expiresAt
      });
    } catch (error) {
      const isDuplicatePassCode = /pass_code/i.test(error.message) && /duplicate/i.test(error.message);
      if (!isDuplicatePassCode || attempt === maxAttempts - 1) {
        throw error;
      }
    }
  }

  throw new Error("Unable to create pass after multiple attempts.");
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return methodNotAllowed(req, res, ["POST"]);
  }

  try {
    const body = await readJsonBody(req);
    const parsedInput = registrationSchema.safeParse(body);

    if (!parsedInput.success) {
      return sendError(res, 400, "Invalid registration input.", parsedInput.error.flatten());
    }

    const event = await getEvent();
    const nowMs = Date.now();
    const eventEndMs = new Date(event.ends_at).getTime();

    if (nowMs > eventEndMs) {
      return sendError(res, 410, "Event registrations are closed.");
    }

    const attendeeEmail = normalizeEmail(parsedInput.data.email);
    const attendeePhone = normalizePhone(parsedInput.data.phone);

    let pass = await findPassByEmailOrPhone({
      eventId: event.id,
      email: attendeeEmail,
      phone: attendeePhone
    });

    let isExisting = true;

    if (!pass) {
      pass = await createPassWithRetries({
        eventId: event.id,
        attendeeName: parsedInput.data.name.trim(),
        attendeeEmail,
        attendeePhone,
        expiresAt: event.ends_at
      });

      isExisting = false;
    }

    const token = createPassToken({
      passId: pass.id,
      passCode: pass.pass_code,
      eventSlug: event.event_slug,
      expiresAt: pass.expires_at,
      tokenVersion: pass.token_version
    });

    const qrPayload = `PDG:${token}`;
    const qrImageDataUrl = await generateQrDataUrl(qrPayload, 164);

    return sendOk(res, {
      event: toPublicEvent(event),
      pass: toPublicPass(pass),
      passToken: token,
      qrPayload,
      qrImageDataUrl,
      isExisting
    });
  } catch (error) {
    return sendError(res, 500, "Failed to register pass.", error.message);
  }
};
