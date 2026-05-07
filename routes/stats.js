// server/routes/stats.js

import { Router } from 'express'
import { getSupabase } from '../lib/supabase.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('coalition_stats')
      .select('*')
      .single()

    if (error) {
      throw error
    }

    return res.json(data)
  } catch (err) {
    console.error('[stats]', err)

    return res.status(500).json({
      error: 'Failed to load coalition stats',
    })
  }
})

export default router