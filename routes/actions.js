// server/routes/actions.js
// POST /api/actions — record a trackable action for a signer
// Actions: 'got_mark' | 'shared_social' | 'shared_story'

import { Router } from 'express'
import { apiLimiter } from '../middleware/rateLimiter.js'
import { ALLOWED_ACTIONS } from '../lib/constants.js'
import { findSignerById } from '../services/signers.js'
import { recordAction } from '../services/actions.js'

const router = Router()

router.post('/', apiLimiter, async (req, res) => {
  const { signerId, action, metadata } = req.body ?? {}

  if (!signerId) return res.status(422).json({ error: 'signerId is required' })
  if (!action)   return res.status(422).json({ error: 'action is required' })
  if (!ALLOWED_ACTIONS.includes(action)) {
    return res.status(422).json({ error: `Unknown action. Must be one of: ${ALLOWED_ACTIONS.join(', ')}` })
  }

  const { data: signer, error: signerErr } = await findSignerById(signerId)
  if (signerErr || !signer) return res.status(404).json({ error: 'Signer not found' })

  const { error } = await recordAction({ signerId, action, metadata: metadata ?? null })
  if (error) {
    console.error('[actions] insert error:', error)
    return res.status(500).json({ error: 'Could not record action' })
  }

  return res.status(201).json({ success: true })
})

export default router
