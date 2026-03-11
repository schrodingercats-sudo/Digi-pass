const { z } = require("zod");

const registrationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().min(8).max(24)
});

const adminLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(100)
});

const adminCreateSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(100),
  role: z.enum(["scanner", "supervisor"]).default("scanner")
});

const seedSupervisorSchema = z.object({
  setupKey: z.string().min(8),
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(100)
});

const redeemSchema = z.object({
  scannedValue: z.string().trim().optional(),
  manualCode: z.string().trim().optional(),
  scanChannel: z.enum(["camera", "manual"]).default("camera")
});

const overrideSchema = z.object({
  passCode: z.string().trim().regex(/^PD-[A-Z0-9]{8}$/),
  action: z.enum(["force_redeem", "revert_redemption", "revoke"]),
  note: z.string().trim().min(3).max(240)
});

module.exports = {
  adminCreateSchema,
  adminLoginSchema,
  overrideSchema,
  redeemSchema,
  registrationSchema,
  seedSupervisorSchema
};
