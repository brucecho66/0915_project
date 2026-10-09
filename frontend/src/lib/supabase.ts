import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://wfvmnouudayelbbomgzs.supabase.co';
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indmdm1ub3V1ZGF5ZWxiYm9tZ3pzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNDI5OTcsImV4cCI6MjEwNTYxODk5N30.8TxMCwdqYcZpnT5N4Acl9PwsxtN_GZtKHchMqtUDtV4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
