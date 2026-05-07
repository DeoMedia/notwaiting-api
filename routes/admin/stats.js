// server/routes/admin/stats.js
// GET /api/admin/stats — full dashboard stats (content_manager+)

import { Router } from 'express'
import { getSupabase } from '../../lib/supabase.js'
import { requireAdmin } from '../../middleware/adminAuth.js'

const router = Router()

router.get('/', requireAdmin('content_manager'), async (req, res) => {
  const supabase = getSupabase()

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

  if (statsRes.error) {
    console.error('[admin/stats]', statsRes.error)
    return res.status(500).json({ error: 'Could not load stats' })
  }

  const actionCounts = { signed: 0, got_mark: 0, shared_social: 0, shared_story: 0 }
  for (const row of actionsRes.data ?? []) {
    if (actionCounts[row.action] !== undefined) actionCounts[row.action]++
  }

  return res.json({
    stats:     statsRes.data,
    waves:     wavesRes.data ?? [],
    countries: countriesRes.data ?? [],
    recent:    recentRes.data ?? [],
    last7Days: actionCounts,
  })
})

export default router
