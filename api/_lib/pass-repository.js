const { supabaseAdmin } = require("./supabase");

const findPassByEmailOrPhone = async ({ eventId, email, phone }) => {
  const byEmail = await supabaseAdmin
    .from("event_passes")
    .select("*")
    .eq("event_id", eventId)
    .eq("attendee_email", email)
    .maybeSingle();

  if (byEmail.error) {
    throw new Error(`Failed to find pass by email: ${byEmail.error.message}`);
  }

  if (byEmail.data) {
    return byEmail.data;
  }

  const byPhone = await supabaseAdmin
    .from("event_passes")
    .select("*")
    .eq("event_id", eventId)
    .eq("attendee_phone", phone)
    .maybeSingle();

  if (byPhone.error) {
    throw new Error(`Failed to find pass by phone: ${byPhone.error.message}`);
  }

  return byPhone.data;
};

const findPassById = async ({ eventId, passId }) => {
  const { data, error } = await supabaseAdmin
    .from("event_passes")
    .select("*")
    .eq("event_id", eventId)
    .eq("id", passId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to find pass by id: ${error.message}`);
  }

  return data;
};

const findPassByCode = async ({ eventId, passCode }) => {
  const { data, error } = await supabaseAdmin
    .from("event_passes")
    .select("*")
    .eq("event_id", eventId)
    .eq("pass_code", passCode)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to find pass by code: ${error.message}`);
  }

  return data;
};

const createPass = async ({ eventId, attendeeName, attendeeEmail, attendeePhone, passCode, expiresAt }) => {
  const { data, error } = await supabaseAdmin
    .from("event_passes")
    .insert({
      event_id: eventId,
      attendee_name: attendeeName,
      attendee_email: attendeeEmail,
      attendee_phone: attendeePhone,
      pass_code: passCode,
      expires_at: expiresAt
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create pass: ${error.message}`);
  }

  return data;
};

const updatePass = async ({ passId, eventId, patch }) => {
  const { data, error } = await supabaseAdmin
    .from("event_passes")
    .update(patch)
    .eq("event_id", eventId)
    .eq("id", passId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update pass: ${error.message}`);
  }

  return data;
};

const markPassExpiredIfNeeded = async ({ pass, eventId }) => {
  if (!pass || pass.status !== "active") {
    return pass;
  }

  if (new Date(pass.expires_at).getTime() > Date.now()) {
    return pass;
  }

  return updatePass({
    passId: pass.id,
    eventId,
    patch: {
      status: "expired"
    }
  });
};

const redeemPassIfActive = async ({ passId, eventId, adminId, overrideNote }) => {
  const { data, error } = await supabaseAdmin
    .from("event_passes")
    .update({
      status: "redeemed",
      redeemed_at: new Date().toISOString(),
      redeemed_by_admin_id: adminId,
      override_note: overrideNote || null
    })
    .eq("id", passId)
    .eq("event_id", eventId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to redeem pass: ${error.message}`);
  }

  return data;
};

const insertScanLog = async ({
  eventId,
  passId,
  passCodeSnapshot,
  attendeeNameSnapshot,
  adminId,
  adminNameSnapshot,
  inputValue,
  scanChannel,
  result,
  reason,
  requesterIp,
  requesterUserAgent
}) => {
  const { error } = await supabaseAdmin.from("scan_logs").insert({
    event_id: eventId,
    pass_id: passId || null,
    pass_code_snapshot: passCodeSnapshot || null,
    attendee_name_snapshot: attendeeNameSnapshot || null,
    admin_id: adminId || null,
    admin_name_snapshot: adminNameSnapshot || null,
    input_value: inputValue,
    scan_channel: scanChannel,
    result,
    reason: reason || null,
    requester_ip: requesterIp || null,
    requester_user_agent: requesterUserAgent || null
  });

  if (error) {
    throw new Error(`Failed to write scan log: ${error.message}`);
  }
};

const listRecentScanLogs = async ({ eventId, limit = 30 }) => {
  const { data, error } = await supabaseAdmin
    .from("scan_logs")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list scan logs: ${error.message}`);
  }

  return data;
};

module.exports = {
  createPass,
  findPassByCode,
  findPassByEmailOrPhone,
  findPassById,
  insertScanLog,
  listRecentScanLogs,
  markPassExpiredIfNeeded,
  redeemPassIfActive,
  updatePass
};
