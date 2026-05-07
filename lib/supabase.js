// server/lib/supabase.js
// Server-side Supabase client using the service role key.
// This bypasses Row Level Security — keep server-side only.

import { createClient } from '@supabase/supabase-js'

let _client = null

export function getSupabase() {
  if (_client) return _client

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server/.env\n' +
      'Copy server/.env.example to server/.env and fill in your values.'
    )
  }

  _client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
  return _client
}
