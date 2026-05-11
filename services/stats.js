// services/stats.js
// Shared coalition stats logic — used by /api/dashboard and /api/admin/stats.
// Runs all queries in parallel and validates every result before returning.

export async function fetchCoalitionStats(supabase) {
  const [statsRes, wavesRes, countriesRes, recentRes, actionsRes] = await Promise.all([
    supabase.from('coalition_stats').select('*').single(),
    supabase.from('wave_breakdown').select('*').limit(10),
    supabase.from('country_breakdown').select('*').limit(10),
    supabase
      .from('signers')
      .select('first_name, country, wave_tag, created_at')
      .order('created_at', { ascending: false })
      .limit(15),
    supabase
      .from('actions')
      .select('action')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
  ])

  if (statsRes.error)     throw Object.assign(new Error('Could not load stats'), { source: 'coalition_stats' })
  if (wavesRes.error)     throw Object.assign(new Error('Could not load stats'), { source: 'wave_breakdown' })
  if (countriesRes.error) throw Object.assign(new Error('Could not load stats'), { source: 'country_breakdown' })
  if (recentRes.error)    throw Object.assign(new Error('Could not load stats'), { source: 'recent_signers' })
  if (actionsRes.error)   throw Object.assign(new Error('Could not load action stats'), { source: 'actions' })

  const last7Days = { signed: 0, got_mark: 0, shared_social: 0, shared_story: 0 }
  for (const row of actionsRes.data ?? []) {
    if (last7Days[row.action] !== undefined) last7Days[row.action]++
  }

  return {
    stats:     statsRes.data,
    waves:     wavesRes.data     ?? [],
    countries: countriesRes.data ?? [],
    recent:    recentRes.data    ?? [],
    last7Days,
  }
}
