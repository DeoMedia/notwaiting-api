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

import adminStoriesRoutes from '../../routes/admin/stories.js'
import { getSupabase } from '../../lib/supabase.js'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/admin/stories', adminStoriesRoutes)
  return app
}

function makeChain(result) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject)
    },
  }
  return chain
}

describe('GET /api/admin/stories', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns all stories', async () => {
    const client = getSupabase()
    client.from.mockReturnValue(makeChain({ data: [{ id: '1', caption: 'Test' }], error: null }))

    const res = await request(makeApp()).get('/api/admin/stories')

    expect(res.status).toBe(200)
    expect(res.body.stories).toHaveLength(1)
  })

  it('filters by wave_tag', async () => {
    const client = getSupabase()
    const chain = makeChain({ data: [], error: null })
    client.from.mockReturnValue(chain)

    await request(makeApp()).get('/api/admin/stories?wave=fintech')

    const calls = chain.eq.mock.calls
    expect(calls.some(([field, val]) => field === 'wave_tag' && val === 'fintech')).toBe(true)
  })

  it('filters by visible=true', async () => {
    const client = getSupabase()
    const chain = makeChain({ data: [], error: null })
    client.from.mockReturnValue(chain)

    await request(makeApp()).get('/api/admin/stories?visible=true')

    const calls = chain.eq.mock.calls
    expect(calls.some(([field, val]) => field === 'is_visible' && val === true)).toBe(true)
  })

  it('filters by visible=false', async () => {
    const client = getSupabase()
    const chain = makeChain({ data: [], error: null })
    client.from.mockReturnValue(chain)

    await request(makeApp()).get('/api/admin/stories?visible=false')

    const calls = chain.eq.mock.calls
    expect(calls.some(([field, val]) => field === 'is_visible' && val === false)).toBe(true)
  })

  it('returns 500 on Supabase error', async () => {
    const client = getSupabase()
    client.from.mockReturnValue(makeChain({ data: null, error: { message: 'DB fail' } }))

    const res = await request(makeApp()).get('/api/admin/stories')

    expect(res.status).toBe(500)
  })

  it('returns empty array (not null) when no stories', async () => {
    const client = getSupabase()
    client.from.mockReturnValue(makeChain({ data: null, error: null }))

    const res = await request(makeApp()).get('/api/admin/stories')

    expect(res.body.stories).toEqual([])
  })
})

describe('PATCH /api/admin/stories/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('toggles visibility to false', async () => {
    const client = getSupabase()
    client.from.mockReturnValue(makeChain({ error: null }))

    const res = await request(makeApp())
      .patch('/api/admin/stories/story-1')
      .send({ is_visible: false })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('toggles visibility to true', async () => {
    const client = getSupabase()
    client.from.mockReturnValue(makeChain({ error: null }))

    const res = await request(makeApp())
      .patch('/api/admin/stories/story-1')
      .send({ is_visible: true })

    expect(res.status).toBe(200)
  })

  it('returns 422 when is_visible is a string', async () => {
    const res = await request(makeApp())
      .patch('/api/admin/stories/story-1')
      .send({ is_visible: 'yes' })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/boolean/i)
  })

  it('returns 422 when is_visible is a number', async () => {
    const res = await request(makeApp())
      .patch('/api/admin/stories/story-1')
      .send({ is_visible: 1 })

    expect(res.status).toBe(422)
  })

  it('returns 500 on Supabase error', async () => {
    const client = getSupabase()
    client.from.mockReturnValue(makeChain({ error: { message: 'Update failed' } }))

    const res = await request(makeApp())
      .patch('/api/admin/stories/story-1')
      .send({ is_visible: true })

    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/admin/stories/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes a story and returns success', async () => {
    const client = getSupabase()
    client.from.mockReturnValue(makeChain({ error: null }))

    const res = await request(makeApp()).delete('/api/admin/stories/story-1')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('returns 500 on delete error', async () => {
    const client = getSupabase()
    client.from.mockReturnValue(makeChain({ error: { message: 'FK error' } }))

    const res = await request(makeApp()).delete('/api/admin/stories/story-1')

    expect(res.status).toBe(500)
  })
})
