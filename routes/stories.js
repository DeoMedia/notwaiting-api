// server/routes/stories.js
// GET  /api/stories
// POST /api/stories

import { Router } from 'express'
import { getSupabase } from '../lib/supabase.js'
import { apiLimiter } from '../middleware/rateLimiter.js'

const router = Router()

router.get('/', apiLimiter, async (req, res) => {
  try {
    const page = Math.max(0, parseInt(req.query.page ?? '0'))
    const limit = Math.min(50, parseInt(req.query.limit ?? '12'))
    const wave = req.query.wave
    const country = req.query.country

    const supabase = getSupabase()

    let query = supabase
      .from('stories')
      .select(`
        id,
        signer_id,
        first_name,
        country,
        wave_tag,
        caption,
        created_at
      `)
      .eq('is_visible', true)
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (wave) {
      query = query.eq('wave_tag', wave)
    }

    if (country) {
      query = query.eq('country', country)
    }

    const { data, error } = await query

    if (error) {
      console.error('[stories] fetch error:', error)

      return res.status(500).json({
        error: 'Could not load stories',
      })
    }

    return res.json({
      stories: data ?? [],
    })
  } catch (err) {
    console.error('[stories] unexpected error:', err)

    return res.status(500).json({
      error: 'Internal server error',
    })
  }
})

router.post('/', apiLimiter, async (req, res) => {
  try {
    const { signerId, caption, waveTag } = req.body ?? {}

    if (!signerId) {
      return res.status(422).json({
        error: 'signerId is required',
      })
    }

    if (!caption || !caption.trim()) {
      return res.status(422).json({
        error: 'caption is required',
      })
    }

    if (!waveTag) {
      return res.status(422).json({
        error: 'waveTag is required',
      })
    }

    if (caption.trim().length > 600) {
      return res.status(422).json({
        error: 'Caption too long (max 600 characters)',
      })
    }

    const supabase = getSupabase()

    const { data: signer, error: signerErr } = await supabase
      .from('signers')
      .select(`
        id,
        first_name,
        country
      `)
      .eq('id', signerId)
      .single()

    if (signerErr || !signer) {
      console.error('[stories] signer error:', signerErr)

      return res.status(404).json({
        error: 'Signer not found',
      })
    }

    await supabase
      .from('stories')
      .delete()
      .eq('signer_id', signerId)

    const { data: story, error: storyErr } = await supabase
      .from('stories')
      .insert({
        signer_id: signerId,
        first_name: signer.first_name,
        country: signer.country,
        wave_tag: waveTag,
        caption: caption.trim(),
        is_visible: true,
      })
      .select(`
        id,
        signer_id,
        first_name,
        country,
        wave_tag,
        caption,
        created_at
      `)
      .single()

    if (storyErr) {
      console.error('[stories] insert error:', storyErr)

      return res.status(500).json({
        error: 'Could not publish story',
      })
    }

    const { error: actionErr } = await supabase
      .from('actions')
      .insert({
        signer_id: signerId,
        action: 'shared_story',
        metadata: {
          wave_tag: waveTag,
          story_id: story.id,
        },
      })

    if (actionErr) {
      console.error('[stories] action tracking error:', actionErr)
    }

    return res.status(201).json({
      success: true,
      storyId: story.id,
      story,
    })
  } catch (err) {
    console.error('[stories] unexpected error:', err)

    return res.status(500).json({
      error: 'Internal server error',
    })
  }
})

export default router