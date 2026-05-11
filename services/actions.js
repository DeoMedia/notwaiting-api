// services/actions.js — all DB operations on the actions table

import { getSupabase } from '../lib/supabase.js'

export async function recordAction({ signerId, action, metadata = null }) {
  const supabase = getSupabase()
  return supabase.from('actions').insert({ signer_id: signerId, action, metadata })
}
