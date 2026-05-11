// server/routes/dashboard.js
// GET /api/dashboard — coalition stats, protected by Supabase JWT (content_manager+)

import { Router } from 'express'
import { getSupabase } from '../lib/supabase.js'
import { requireAdmin } from '../middleware/adminAuth.js'
import { fetchCoalitionStats } from '../services/stats.js'

const router = Router()

router.get('/', requireAdmin('content_manager'), async (req, res) => {
  try {
    const data = await fetchCoalitionStats(getSupabase())
    return res.json(data)
  } catch (err) {
    console.error('[dashboard]', err.source ?? '', err.message)
    return res.status(500).json({ error: err.message ?? 'Could not load dashboard data' })
  }
})

export default router
