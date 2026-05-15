// services/signers.js — all DB operations on the signers table

import { getSupabase } from '../lib/supabase.js'

export async function insertSigner({ firstName, country, wave, waveTag, email }) {
  const supabase = getSupabase()
  return supabase
    .from('signers')
    .insert({ first_name: firstName, country, wave, wave_tag: waveTag, email: email || null })
    .select('id')
    .single()
}

export async function findSignerById(id) {
  const supabase = getSupabase()
  return supabase
    .from('signers')
    .select('id, first_name, country')
    .eq('id', id)
    .single()
}

export async function listSigners({ page = 0, limit = 20, search, country, wave } = {}) {
  const supabase = getSupabase()
  let query = supabase
    .from('signers')
    .select('id, first_name, country, wave_tag, wave, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)

  if (search)  query = query.ilike('first_name', `%${search}%`)
  if (country) query = query.eq('country', country)
  if (wave)    query = query.eq('wave_tag', wave)

  return query
}

export async function deleteSigner(id) {
  const supabase = getSupabase()
  return supabase.from('signers').delete().eq('id', id)
}
