import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../../lib/supabase.js', () => {
  const client = { from: vi.fn() }
  return { getSupabase: vi.fn(() => client) }
})

vi.mock('../../middleware/adminAuth.js', () => ({
  requireAdmin: (role) => (req, _res, next) => {
    req.adminUser = { id: 'admin-id', email: 'a@b.com', role }
    next()
  },
}))

import adminStatsRoutes from '../../routes/admin/stats.js'
import { getSupabase } from '../../lib/supabase.js'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/admin/stats', adminStatsRoutes)
  return app
}

function mockAllQueries(client, overrides = {}) {
  const defaults = {
    stats: { data: { total_signers: 200, total_countries: 20 }, error: null },
    waves: { data: [{ wave_tag: 'tech', signer_count: 100 }], error: null },
    countries: { data: [{ country: 'nigeria', signer_count: 80 }], error: null },
    recent: { data: [{ first_name: 'Test', country: 'ng', wave_tag: 'tech', created_at: '2026-01-01' }], error: null },
    actions: { data: [{ action: 'signed' }, { action: 'shared_story' }], error: null },
  }
  const mocked = { ...defaults, ...overrides }

  client.from
    .mockReturnValueOnce({
      select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue(mocked.stats) }),
    })
    .mockReturnValueOnce({
      select: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(mocked.waves) }),
    })
    .mockReturnValueOnce({
      select: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(mocked.countries) }),
    })
    .mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(mocked.recent) }),
      }),
    })
    .mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockResolvedValue(mocked.actions),
      }),
    })
}

describe('GET /api/admin/stats', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns full stats bundle', async () => {
    const client = getSupabase()
    mockAllQueries(client)

    const res = await request(makeApp()).get('/api/admin/stats')

    expect(res.status).toBe(200)
    expect(res.body.stats.total_signers).toBe(200)
    expect(Array.isArray(res.body.waves)).toBe(true)
    expect(Array.isArray(res.body.countries)).toBe(true)
    expect(Array.isArray(res.body.recent)).toBe(true)
    expect(res.body.last7Days).toBeDefined()
  })

  it('returns 500 when coalition_stats fails', async () => {
    const client = getSupabase()
    mockAllQueries(client, { stats: { data: null, error: { message: 'View gone' } } })

    const res = await request(makeApp()).get('/api/admin/stats')

    expect(res.status).toBe(500)
  })

  it('correctly aggregates action counts from last 7 days', async () => {
    const client = getSupabase()
    mockAllQueries(client, {
      actions: {
        data: [
          { action: 'signed' },
          { action: 'signed' },
          { action: 'signed' },
          { action: 'got_mark' },
          { action: 'shared_social' },
          { action: 'shared_social' },
          { action: 'shared_story' },
        ],
        error: null,
      },
    })

    const res = await request(makeApp()).get('/api/admin/stats')

    expect(res.body.last7Days.signed).toBe(3)
    expect(res.body.last7Days.got_mark).toBe(1)
    expect(res.body.last7Days.shared_social).toBe(2)
    expect(res.body.last7Days.shared_story).toBe(1)
  })

  it('returns 500 when actions query fails', async () => {
    const client = getSupabase()
    mockAllQueries(client, {
      actions: { data: null, error: { message: 'Actions table unreachable' } },
    })

    const res = await request(makeApp()).get('/api/admin/stats')

    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/could not load action stats/i)
  })

  it('returns 500 when wave_breakdown query fails', async () => {
    const client = getSupabase()
    mockAllQueries(client, {
      waves: { data: null, error: { message: 'View unavailable' } },
    })

    const res = await request(makeApp()).get('/api/admin/stats')

    expect(res.status).toBe(500)
  })

  it('returns 500 when country_breakdown query fails', async () => {
    const client = getSupabase()
    mockAllQueries(client, {
      countries: { data: null, error: { message: 'View unavailable' } },
    })

    const res = await request(makeApp()).get('/api/admin/stats')

    expect(res.status).toBe(500)
  })

  it('returns 500 when recent signers query fails', async () => {
    const client = getSupabase()
    mockAllQueries(client, {
      recent: { data: null, error: { message: 'Table error' } },
    })

    const res = await request(makeApp()).get('/api/admin/stats')

    expect(res.status).toBe(500)
  })
})
