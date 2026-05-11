// server/routes/stories.js
// GET  /api/stories
// POST /api/stories

import { Router } from 'express'
import { apiLimiter } from '../middleware/rateLimiter.js'
import { KNOWN_WAVE_TAGS } from '../lib/constants.js'
import { listVisibleStories, upsertStory } from '../services/stories.js'
import { findSignerById } from '../services/signers.js'
import { recordAction } from '../services/actions.js'

const router = Router()

function sanitiseWaveTag(raw) {
  return String(raw).trim().replace(/[<>]/g, '').slice(0, 60)
}

router.get('/', apiLimiter, async (req, res) => {
  try {
    const page    = Math.max(0, parseInt(req.query.page  ?? '0'))
    const limit   = Math.max(1, Math.min(50, parseInt(req.query.limit ?? '12')))
    const wave    = req.query.wave    || undefined
    const country = req.query.country || undefined

    const { data, error } = await listVisibleStories({ page, limit, wave, country })

    if (error) {
      console.error('[stories] fetch error:', error)
      return res.status(500).json({ error: 'Could not load stories' })
    }

    return res.json({ stories: data ?? [] })
  } catch (err) {
    console.error('[stories] unexpected error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/', apiLimiter, async (req, res) => {
  try {
    const { signerId, caption, waveTag } = req.body ?? {}

    if (!signerId)              return res.status(422).json({ error: 'signerId is required' })
    if (!caption?.trim())       return res.status(422).json({ error: 'caption is required' })
    if (!waveTag)               return res.status(422).json({ error: 'waveTag is required' })
    if (caption.trim().length > 600) return res.status(422).json({ error: 'Caption too long (max 600 characters)' })

    const sanitisedTag = sanitiseWaveTag(waveTag)
    if (!sanitisedTag) return res.status(422).json({ error: 'Invalid waveTag' })

    const { data: signer, error: signerErr } = await findSignerById(signerId)
    if (signerErr || !signer) {
      console.error('[stories] signer error:', signerErr)
      return res.status(404).json({ error: 'Signer not found' })
    }

    const { data: story, error: storyErr } = await upsertStory({
      signerId,
      firstName: signer.first_name,
      country:   signer.country,
      waveTag:   sanitisedTag,
      caption:   caption.trim(),
    })

    if (storyErr) {
      console.error('[stories] upsert error:', storyErr)
      return res.status(500).json({ error: 'Could not publish story' })
    }

    const { error: actionErr } = await recordAction({
      signerId,
      action:   'shared_story',
      metadata: { wave_tag: sanitisedTag, story_id: story.id },
    })
    if (actionErr) console.error('[stories] action tracking error:', actionErr)

    return res.status(201).json({ success: true, storyId: story.id, story })
  } catch (err) {
    console.error('[stories] unexpected error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
