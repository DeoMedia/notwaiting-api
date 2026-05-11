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

import actionsRoutes from '../routes/actions.js'
import { getSupabase } from '../lib/supabase.js'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/actions', actionsRoutes)
  return app
}

// Helper: mock a successful signer lookup + action insert in sequence
function mockSignerFound(client, signerId = 'uuid-1') {
  client.from
    .mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: signerId }, error: null })
        })
      })
    })
    .mockReturnValueOnce({
      insert: vi.fn().mockResolvedValue({ error: null })
    })
}

// Helper: mock signer not found
function mockSignerNotFound(client) {
  client.from.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } })
      })
    })
  })
}

describe('POST /api/actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('records got_mark action and returns 201', async () => {
    const client = getSupabase()
    mockSignerFound(client)

    const res = await request(makeApp())
      .post('/api/actions')
      .send({ signerId: 'uuid-1', action: 'got_mark' })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
  })

  it('records shared_social action', async () => {
    const client = getSupabase()
    mockSignerFound(client)

    const res = await request(makeApp())
      .post('/api/actions')
      .send({ signerId: 'uuid-1', action: 'shared_social', metadata: { platform: 'twitter' } })

    expect(res.status).toBe(201)
  })

  it('records shared_story action', async () => {
    const client = getSupabase()
    mockSignerFound(client)

    const res = await request(makeApp())
      .post('/api/actions')
      .send({ signerId: 'uuid-1', action: 'shared_story' })

    expect(res.status).toBe(201)
  })

  it('returns 422 when signerId is missing', async () => {
    const res = await request(makeApp())
      .post('/api/actions')
      .send({ action: 'got_mark' })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/signerId/i)
  })

  it('returns 422 when action is missing', async () => {
    const res = await request(makeApp())
      .post('/api/actions')
      .send({ signerId: 'uuid-1' })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/action/i)
  })

  it('returns 422 for unknown action type', async () => {
    const res = await request(makeApp())
      .post('/api/actions')
      .send({ signerId: 'uuid-1', action: 'deleted_account' })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/unknown action/i)
  })

  it('rejects all unlisted action types (no arbitrary action injection)', async () => {
    for (const action of ['admin', 'delete', 'update_role', 'DROP TABLE']) {
      const res = await request(makeApp())
        .post('/api/actions')
        .send({ signerId: 'uuid-1', action })
      expect(res.status).toBe(422)
    }
  })

  it('returns 404 for phantom signer IDs — signer validated before inserting', async () => {
    const client = getSupabase()
    mockSignerNotFound(client)

    const res = await request(makeApp())
      .post('/api/actions')
      .send({ signerId: 'completely-fake-uuid', action: 'got_mark' })

    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/signer not found/i)
  })

  it('returns 500 on Supabase insert error', async () => {
    const client = getSupabase()
    client.from
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'uuid-1' }, error: null })
          })
        })
      })
      .mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: { message: 'DB fail' } })
      })

    const res = await request(makeApp())
      .post('/api/actions')
      .send({ signerId: 'uuid-1', action: 'got_mark' })

    expect(res.status).toBe(500)
  })

  it('stores metadata when provided', async () => {
    const client = getSupabase()
    let insertedData = null

    client.from
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'uuid-1' }, error: null })
          })
        })
      })
      .mockReturnValueOnce({
        insert: vi.fn().mockImplementation((data) => {
          insertedData = data
          return Promise.resolve({ error: null })
        })
      })

    await request(makeApp())
      .post('/api/actions')
      .send({ signerId: 'uuid-1', action: 'shared_social', metadata: { platform: 'linkedin' } })

    expect(insertedData.metadata).toEqual({ platform: 'linkedin' })
  })
})
