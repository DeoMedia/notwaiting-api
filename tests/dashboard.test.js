import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../lib/supabase.js', () => {
  const client = { from: vi.fn() }
  return { getSupabase: vi.fn(() => client) }
})

// Dashboard now uses requireAdmin — bypass JWT for route logic tests
vi.mock('../middleware/adminAuth.js', () => ({
  requireAdmin: (role) => (req, _res, next) => {
    req.adminUser = { id: 'admin-id', email: 'admin@test.com', role }
    next()
  },
}))

import dashboardRoutes from '../routes/dashboard.js'
import { getSupabase } from '../lib/supabase.js'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/dashboard', dashboardRoutes)
  return app
}

function mockAllQueries(client, overrides = {}) {
  const defaults = {
    stats:     { data: { total_signers: 100, total_countries: 10 }, error: null },
    waves:     { data: [{ wave_tag: 'tech', signer_count: 50 }], error: null },
    countries: { data: [{ country: 'nigeria', signer_count: 30 }], error: null },
    recent:    { data: [{ first_name: 'Ade', country: 'nigeria', wave_tag: 'tech', created_at: '2026-01-01' }], error: null },
    actions:   { data: [{ action: 'signed' }, { action: 'got_mark' }], error: null },
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

describe('GET /api/dashboard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns dashboard data for authenticated admin', async () => {
    const client = getSupabase()
    mockAllQueries(client)

    const res = await request(makeApp()).get('/api/dashboard')

    expect(res.status).toBe(200)
    expect(res.body.stats.total_signers).toBe(100)
    expect(Array.isArray(res.body.waves)).toBe(true)
    expect(Array.isArray(res.body.countries)).toBe(true)
    expect(res.body.last7Days).toBeDefined()
  })

  it('returns 500 when coalition_stats query fails', async () => {
    const client = getSupabase()
    mockAllQueries(client, { stats: { data: null, error: { message: 'View missing' } } })

    const res = await request(makeApp()).get('/api/dashboard')

    expect(res.status).toBe(500)
  })

  it('returns 500 when wave_breakdown query fails', async () => {
    const client = getSupabase()
    mockAllQueries(client, { waves: { data: null, error: { message: 'View down' } } })

    const res = await request(makeApp()).get('/api/dashboard')

    expect(res.status).toBe(500)
  })

  it('returns 500 when country_breakdown query fails', async () => {
    const client = getSupabase()
    mockAllQueries(client, { countries: { data: null, error: { message: 'View down' } } })

    const res = await request(makeApp()).get('/api/dashboard')

    expect(res.status).toBe(500)
  })

  it('returns 500 when recent signers query fails', async () => {
    const client = getSupabase()
    mockAllQueries(client, { recent: { data: null, error: { message: 'Table error' } } })

    const res = await request(makeApp()).get('/api/dashboard')

    expect(res.status).toBe(500)
  })

  it('returns 500 when actions query fails', async () => {
    const client = getSupabase()
    mockAllQueries(client, { actions: { data: null, error: { message: 'actions table down' } } })

    const res = await request(makeApp()).get('/api/dashboard')

    expect(res.status).toBe(500)
  })

  it('correctly counts action types in last7Days', async () => {
    const client = getSupabase()
    mockAllQueries(client, {
      actions: {
        data: [
          { action: 'signed' },
          { action: 'signed' },
          { action: 'got_mark' },
          { action: 'shared_social' },
          { action: 'shared_story' },
          { action: 'shared_story' },
        ],
        error: null,
      },
    })

    const res = await request(makeApp()).get('/api/dashboard')

    expect(res.body.last7Days.signed).toBe(2)
    expect(res.body.last7Days.got_mark).toBe(1)
    expect(res.body.last7Days.shared_social).toBe(1)
    expect(res.body.last7Days.shared_story).toBe(2)
  })

  it('returns empty arrays when wave/country/recent return null data (no error)', async () => {
    const client = getSupabase()
    mockAllQueries(client, {
      waves:     { data: null, error: null },
      countries: { data: null, error: null },
      recent:    { data: null, error: null },
      actions:   { data: [], error: null },
    })

    const res = await request(makeApp()).get('/api/dashboard')

    expect(res.body.waves).toEqual([])
    expect(res.body.countries).toEqual([])
    expect(res.body.recent).toEqual([])
  })
})
