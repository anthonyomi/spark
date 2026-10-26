// Fill these in from Supabase → Project Settings → API.
// The anon/publishable key is safe to publish: row-level security keeps the data
// readable only by the two accounts listed in the `partners` table.
// Leave them blank to run in demo mode (data stays in this browser only).
window.SPARK_CONFIG = {
  supabaseUrl: "https://brcqjusrqdzedepvjxdj.supabase.co",
  supabaseAnonKey: "sb_publishable_MB9ljZVGZS2ACkmCRpFmmg_9WGeDw0l",

  // Must match window_hours in supabase/schema.sql
  windowHours: 72,

  // Only used in demo mode — in live mode names come from the partners table
  demoPartners: ["Anthony", "Bolaji"],
  demoAvatars: [],
};
