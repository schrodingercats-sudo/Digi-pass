const bcrypt = require("bcryptjs");
const { methodNotAllowed, sendError, sendOk } = require("./_lib/responses");
const { requireSupervisor } = require("./_lib/guards");
const { readJsonBody } = require("./_lib/request");
const { adminCreateSchema } = require("./_lib/validators");
const { createAdmin, findAdminByEmail, listAdmins } = require("./_lib/admin-repository");
const { normalizeEmail } = require("./_lib/parsers");
const { toPublicAdmin } = require("./_lib/serializers");

const listAllAdmins = async (res) => {
  const admins = await listAdmins();
  return sendOk(res, {
    admins: admins.map(toPublicAdmin)
  });
};

const createNewAdmin = async (req, res) => {
  const body = await readJsonBody(req);
  const parsedInput = adminCreateSchema.safeParse(body);
  if (!parsedInput.success) {
    return sendError(res, 400, "Invalid admin input.", parsedInput.error.flatten());
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
    role: parsedInput.data.role
  });

  return sendOk(res, {
    admin: toPublicAdmin(admin)
  }, 201);
};

module.exports = async (req, res) => {
  const session = requireSupervisor(req, res);
  if (!session) {
    return undefined;
  }

  try {
    if (req.method === "GET") {
      return listAllAdmins(res);
    }

    if (req.method === "POST") {
      return createNewAdmin(req, res);
    }

    return methodNotAllowed(req, res, ["GET", "POST"]);
  } catch (error) {
    return sendError(res, 500, "Failed to manage admin users.", error.message);
  }
};
