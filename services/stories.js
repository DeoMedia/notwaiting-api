// services/stories.js — all DB operations on the stories table

import { getSupabase } from '../lib/supabase.js'

const STORY_FIELDS = 'id, signer_id, first_name, country, wave_tag, caption, created_at'

export async function listVisibleStories({ page = 0, limit = 12, wave, country } = {}) {
  const supabase = getSupabase()
  let query = supabase
    .from('stories')
    .select(STORY_FIELDS)
    .eq('is_visible', true)
    .order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)

  if (wave)    query = query.eq('wave_tag', wave)
  if (country) query = query.eq('country', country)

  return query
}

export async function upsertStory({ signerId, firstName, country, waveTag, caption }) {
  const supabase = getSupabase()
  return supabase
    .from('stories')
    .upsert(
      { signer_id: signerId, first_name: firstName, country, wave_tag: waveTag, caption, is_visible: true },
      { onConflict: 'signer_id' }
    )
    .select(STORY_FIELDS)
    .single()
}

export async function listAllStories({ page = 0, limit = 20, wave, visible } = {}) {
  const supabase = getSupabase()
  let query = supabase
    .from('stories')
    .select('id, first_name, country, wave_tag, caption, is_visible, created_at')
    .order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)

  if (wave !== undefined)    query = query.eq('wave_tag', wave)
  if (visible === true)      query = query.eq('is_visible', true)
  else if (visible === false) query = query.eq('is_visible', false)

  return query
}

export async function setStoryVisibility(id, isVisible) {
  const supabase = getSupabase()
  return supabase.from('stories').update({ is_visible: isVisible }).eq('id', id)
}

export async function deleteStory(id) {
  const supabase = getSupabase()
  return supabase.from('stories').delete().eq('id', id)
}
