const { supabaseAdmin } = require("./supabase");

const countAdmins = async () => {
  const { count, error } = await supabaseAdmin
    .from("admin_users")
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(`Failed to count admins: ${error.message}`);
  }

  return count || 0;
};

const findAdminByEmail = async (email) => {
  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to find admin by email: ${error.message}`);
  }

  return data;
};

const findAdminById = async (adminId) => {
  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("*")
    .eq("id", adminId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to find admin by id: ${error.message}`);
  }

  return data;
};

const createAdmin = async ({ fullName, email, passwordHash, role }) => {
  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .insert({
      full_name: fullName,
      email,
      password_hash: passwordHash,
      role
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create admin: ${error.message}`);
  }

  return data;
};

const listAdmins = async () => {
  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list admins: ${error.message}`);
  }

  return data;
};

const updateLastLogin = async (adminId) => {
  const { error } = await supabaseAdmin
    .from("admin_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", adminId);

  if (error) {
    throw new Error(`Failed to update admin login time: ${error.message}`);
  }
};

module.exports = {
  countAdmins,
  createAdmin,
  findAdminByEmail,
  findAdminById,
  listAdmins,
  updateLastLogin
};
