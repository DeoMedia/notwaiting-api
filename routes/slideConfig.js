import { Router } from 'express'

const router = Router()

// Dates are server-side only — can't be spoofed by client clock.
// unlocksOn: null = always live.
// Order here is "oldest first"; the response reverses it so newest is index 0.
const SLIDE_MANIFEST = [
  { index: 0, unlocksOn: null },
  { index: 1, unlocksOn: '2026-05-15' },
  { index: 2, unlocksOn: '2026-05-18' },
]

router.get('/', (_req, res) => {
  const today = new Date().toISOString().split('T')[0] // 'YYYY-MM-DD'

  const activeSlides = SLIDE_MANIFEST
    .filter(({ unlocksOn }) => !unlocksOn || unlocksOn <= today)
    .map(({ index }) => index)
    .reverse() // latest-unlocked first

  res.json({ activeSlides })
})

export default router
