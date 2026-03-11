const { createClient } = require("@supabase/supabase-js");
const { config } = require("./config");

const supabaseAdmin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: {
    persistSession: false
  }
});

module.exports = { supabaseAdmin };
