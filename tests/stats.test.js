import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../lib/supabase.js', () => {
  const client = { from: vi.fn() }
  return { getSupabase: vi.fn(() => client) }
})

vi.mock('../middleware/rateLimiter.js', () => ({
  apiLimiter: (_req, _res, next) => next(),
  manifestoLimiter: (_req, _res, next) => next(),
  claudeLimiter: (_req, _res, next) => next(),
}))

import statsRoutes from '../routes/stats.js'
import { getSupabase } from '../lib/supabase.js'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/stats', statsRoutes)
  return app
}

describe('GET /api/stats', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns coalition stats', async () => {
    const client = getSupabase()
    client.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            total_signers: 5000,
            total_countries: 45,
            total_marks: 1200,
            total_shares: 800,
            signed_today: 120,
          },
          error: null,
        }),
      }),
    })

    const res = await request(makeApp()).get('/api/stats')

    expect(res.status).toBe(200)
    expect(res.body.total_signers).toBe(5000)
    expect(res.body.total_countries).toBe(45)
  })

  it('returns 500 on Supabase error', async () => {
    const client = getSupabase()
    client.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'View not found' } }),
      }),
    })

    const res = await request(makeApp()).get('/api/stats')

    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/failed to load/i)
  })
})
