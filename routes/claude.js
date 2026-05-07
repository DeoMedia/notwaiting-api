// server/routes/claude.js
// POST /api/claude — secure server-side proxy for the Anthropic API
// The API key NEVER leaves this server.

import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { claudeLimiter } from '../middleware/rateLimiter.js'

const router = Router()

const SYSTEM_PROMPT = `You are a social media caption writer for the #NotWaiting movement — a pan-African coalition of builders, creators, and changemakers who are building Africa's future right now, without waiting for permission.

VOICE:
- Bold, authentic, energising — not corporate, not generic
- Speaks with pride about African excellence  
- Confident without being aggressive
- Never stereotypes or tokenises Africa

FORMAT:
- 2–4 sentences maximum — tight and shareable
- Always end with #NotWaiting
- Suitable for LinkedIn, Instagram, and X/Twitter

RULES:
- Write exactly ONE caption
- No preamble, no alternatives, no explanation — just the caption
- Do not mention Claude or AI
- If the request is clearly off-topic or harmful, respond only with the word: DECLINED`

function buildPrompt(body) {
  const { waveTag, subject, detail, customPrompt } = body
  if (customPrompt) return customPrompt

  const subjectMap = {
    me: 'me (first person, use "I")',
    someone: 'someone I know',
    organisation: 'an organisation'
  }
  const about = subjectMap[subject] || 'someone'
  const extra = detail ? ` Context: ${detail}.` : ''
  return `Write a bold, shareable #NotWaiting caption about ${about} who is building in the ${waveTag || 'tech'} space.${extra} Make it feel personal and powerful.`
}

router.post('/', claudeLimiter, async (req, res) => {
  const { waveTag, subject, detail, customPrompt } = req.body || {}

  if (!waveTag && !customPrompt) {
    return res.status(422).json({ error: 'waveTag is required' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Claude API is not configured on this server.' })
  }

  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: buildPrompt({
          waveTag,
          subject,
          detail: detail?.slice(0, 120),
          customPrompt: customPrompt?.slice(0, 500)
        })
      }]
    })

    const caption = message.content.find(b => b.type === 'text')?.text?.trim() ?? ''

    if (caption === 'DECLINED') {
      return res.status(422).json({ error: 'That request is outside what this tool supports.' })
    }

    return res.json({ caption })
  } catch (err) {
    console.error('[claude] API error:', err.message)
    return res.status(503).json({ error: 'Claude is temporarily unavailable. Try again shortly.' })
  }
})

export default router
