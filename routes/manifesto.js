// server/routes/manifesto.js
// POST /api/manifesto  — sign the manifesto
// GET  /api/manifesto/count — live signer count + countries

import { Router } from 'express'
import { getSupabase } from '../lib/supabase.js'
import { manifestoLimiter } from '../middleware/rateLimiter.js'
import { TAG_KEYWORDS } from '../lib/constants.js'

const router = Router()

function inferWaveTag(wave) {
  if (!wave) return null
  const lower = wave.toLowerCase()
  for (const [keyword, tag] of TAG_KEYWORDS) {
    if (lower.includes(keyword)) return tag
  }
  return null
}

function sanitise(str, max) {
  if (!str) return ''
  return String(str).trim().replace(/[<>]/g, '').slice(0, max)
}

// POST /api/manifesto — sign the manifesto
router.post('/', manifestoLimiter, async (req, res) => {
  const firstName = sanitise(req.body.firstName, 60)
  const country   = sanitise(req.body.country, 80)
  const wave      = sanitise(req.body.wave, 120) || null

  if (!firstName) return res.status(422).json({ error: 'First name is required' })
  if (!country)   return res.status(422).json({ error: 'Country is required' })

  const waveTag = inferWaveTag(wave)
  const supabase = getSupabase()

  const { data: signer, error } = await supabase
    .from('signers')
    .insert({ first_name: firstName, country, wave, wave_tag: waveTag })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Looks like you have already signed! Thank you.' })
    }
    console.error('[manifesto] insert error:', error)
    return res.status(500).json({ error: 'Could not save your signature. Please try again.' })
  }

  // Record the 'signed' action
  await supabase.from('actions').insert({
    signer_id: signer.id,
    action: 'signed',
    metadata: { wave_tag: waveTag, country }
  })

  return res.status(201).json({ success: true, signerId: signer.id })
})

// GET /api/manifesto/count — for the live counter on the homepage
router.get('/count', async (_req, res) => {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('coalition_stats')
    .select('total_signers, total_countries')
    .single()

  if (error) return res.status(500).json({ error: 'Could not fetch count' })
  return res.json(data)
})

export default router
