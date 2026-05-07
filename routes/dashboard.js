// server/routes/dashboard.js
// GET /api/dashboard — admin stats (password protected via header)
//
// SECURITY: Pass the dashboard password as:
//   Authorization: Bearer YOUR_DASHBOARD_SECRET
//
// This is a basic deterrent. For production, replace with
// Supabase Auth + JWT validation.

import { Router } from 'express'
import { getSupabase } from '../lib/supabase.js'

const router = Router()

function checkAuth(req, res) {
  const secret = process.env.DASHBOARD_SECRET
  const auth   = req.headers.authorization ?? ''
  const token  = auth.startsWith('Bearer ') ? auth.slice(7) : ''

  if (!secret || token !== secret) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  return true
}

router.get('/', async (req, res) => {
  if (!checkAuth(req, res)) return

  const supabase = getSupabase()

  const [statsRes, wavesRes, countriesRes, recentRes, actionsBreakdownRes] = await Promise.all([
    supabase.from('coalition_stats').select('*').single(),
    supabase.from('wave_breakdown').select('*').limit(8),
    supabase.from('country_breakdown').select('*').limit(10),
    supabase
      .from('signers')
      .select('first_name, country, wave_tag, created_at')
      .order('created_at', { ascending: false })
      .limit(15),
    supabase
      .from('actions')
      .select('action')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
  ])

  if (statsRes.error) {
    console.error('[dashboard] stats error:', statsRes.error)
    return res.status(500).json({ error: 'Could not load dashboard data' })
  }

  // Count actions by type for last 7 days
  const actionCounts = { signed: 0, got_mark: 0, shared_social: 0, shared_story: 0 }
  for (const row of actionsBreakdownRes.data ?? []) {
    if (actionCounts[row.action] !== undefined) actionCounts[row.action]++
  }

  return res.json({
    stats: statsRes.data,
    waves: wavesRes.data ?? [],
    countries: countriesRes.data ?? [],
    recent: recentRes.data ?? [],
    last7Days: actionCounts
  })
})

export default router
