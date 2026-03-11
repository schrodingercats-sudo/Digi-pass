const toPublicPass = (passRow) => ({
  id: passRow.id,
  name: passRow.attendee_name,
  email: passRow.attendee_email,
  phone: passRow.attendee_phone,
  passCode: passRow.pass_code,
  status: passRow.status,
  issuedAt: passRow.issued_at,
  expiresAt: passRow.expires_at,
  redeemedAt: passRow.redeemed_at,
  redeemedByAdminId: passRow.redeemed_by_admin_id,
  overrideNote: passRow.override_note
});

const toPublicEvent = (eventRow) => ({
  id: eventRow.id,
  eventName: eventRow.event_name,
  eventSlug: eventRow.event_slug,
  venue: eventRow.venue,
  startsAt: eventRow.starts_at,
  endsAt: eventRow.ends_at,
  timezone: eventRow.timezone
});

const toPublicAdmin = (adminRow) => ({
  id: adminRow.id,
  fullName: adminRow.full_name,
  email: adminRow.email,
  role: adminRow.role,
  isActive: adminRow.is_active,
  createdAt: adminRow.created_at,
  lastLoginAt: adminRow.last_login_at
});

module.exports = {
  toPublicAdmin,
  toPublicEvent,
  toPublicPass
};
