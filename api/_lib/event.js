const { config } = require("./config");
const { supabaseAdmin } = require("./supabase");

let cachedEvent = null;
let cachedAt = 0;
const EVENT_CACHE_TTL_MS = 30_000;

const getEvent = async () => {
  const now = Date.now();

  if (cachedEvent && now - cachedAt < EVENT_CACHE_TTL_MS) {
    return cachedEvent;
  }

  const { data, error } = await supabaseAdmin
    .from("event_settings")
    .select("*")
    .eq("event_slug", config.eventSlug)
    .single();

  if (error) {
    throw new Error(`Unable to load event settings: ${error.message}`);
  }

  cachedEvent = data;
  cachedAt = now;
  return data;
};

module.exports = {
  getEvent
};
