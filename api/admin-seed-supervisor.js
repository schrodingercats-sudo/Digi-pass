const bcrypt = require("bcryptjs");
const { methodNotAllowed, sendError, sendOk } = require("./_lib/responses");
const { readJsonBody } = require("./_lib/request");
const { seedSupervisorSchema } = require("./_lib/validators");
const { config } = require("./_lib/config");
const { countAdmins, createAdmin, findAdminByEmail } = require("./_lib/admin-repository");
const { normalizeEmail } = require("./_lib/parsers");
const { toPublicAdmin } = require("./_lib/serializers");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return methodNotAllowed(req, res, ["POST"]);
  }

  try {
    const body = await readJsonBody(req);
    const parsedInput = seedSupervisorSchema.safeParse(body);
    if (!parsedInput.success) {
      return sendError(res, 400, "Invalid setup input.", parsedInput.error.flatten());
    }

    if (parsedInput.data.setupKey !== config.adminSetupKey) {
      return sendError(res, 403, "Invalid setup key.");
    }

    const existingAdminsCount = await countAdmins();
    if (existingAdminsCount > 0) {
      return sendError(res, 409, "Supervisor already seeded.");
    }

    const email = normalizeEmail(parsedInput.data.email);
    const existingAdmin = await findAdminByEmail(email);
    if (existingAdmin) {
      return sendError(res, 409, "Admin with this email already exists.");
    }

    const passwordHash = await bcrypt.hash(parsedInput.data.password, 12);
    const admin = await createAdmin({
      fullName: parsedInput.data.fullName.trim(),
      email,
      passwordHash,
      role: "supervisor"
    });

    return sendOk(res, {
      admin: toPublicAdmin(admin),
      message: "Supervisor account created."
    });
  } catch (error) {
    return sendError(res, 500, "Failed to seed supervisor.", error.message);
  }
};
