// server/routes/actions.js
// POST /api/actions — record a trackable action for a signer
// Actions: 'got_mark' | 'shared_social' | 'shared_story'

import { Router } from 'express'
import { getSupabase } from '../lib/supabase.js'
import { apiLimiter } from '../middleware/rateLimiter.js'

const router = Router()

const ALLOWED = ['got_mark', 'shared_social', 'shared_story']

router.post('/', apiLimiter, async (req, res) => {
  const { signerId, action, metadata } = req.body ?? {}

  if (!signerId) return res.status(422).json({ error: 'signerId is required' })
  if (!action)   return res.status(422).json({ error: 'action is required' })
  if (!ALLOWED.includes(action)) {
    return res.status(422).json({ error: `Unknown action. Must be one of: ${ALLOWED.join(', ')}` })
  }

  const supabase = getSupabase()
  const { error } = await supabase.from('actions').insert({
    signer_id: signerId,
    action,
    metadata: metadata ?? null
  })

  if (error) {
    console.error('[actions] insert error:', error)
    return res.status(500).json({ error: 'Could not record action' })
  }

  return res.status(201).json({ success: true })
})

export default router
