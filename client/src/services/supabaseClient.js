import { createClient } from '@supabase/supabase-js';

const defaultUrl = 'https://nggbfdsdpotszdhfldqk.supabase.co';
const defaultAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nZ2JmZHNkcG90c3pkaGZsZHFrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTk5NTkxOCwiZXhwIjoyMTAxNTcxOTE4fQ.zugjt1ZMTPaPO4upEaKw0iqa1TipSO49_znuQigoo6M';

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const effectiveUrl = (rawUrl && !rawUrl.includes('placeholder')) ? rawUrl : defaultUrl;
const effectiveKey = (rawKey && !rawKey.includes('placeholder')) ? rawKey : defaultAnonKey;

export const isSupabaseConfigured = () => {
  return Boolean(effectiveUrl) && Boolean(effectiveKey);
};

export const supabase = createClient(effectiveUrl, effectiveKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
