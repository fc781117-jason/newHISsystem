import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

export const ADMIN_EMAIL = (import.meta.env.VITE_APP_ADMIN_EMAIL || "fc781117@gmail.com").toLowerCase();
export const APP_TITLE = import.meta.env.VITE_APP_TITLE || "NEW HIS系統-診所營運流程整合系統 Demo V11";
