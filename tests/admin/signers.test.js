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

import signersRoutes from '../../routes/admin/signers.js'
import { getSupabase } from '../../lib/supabase.js'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/admin/signers', signersRoutes)
  return app
}

// Thenable query chain — methods return `this`, resolves on await
function makeChain(result) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject)
    },
  }
  return chain
}

describe('GET /api/admin/signers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns signers list and total count', async () => {
    const client = getSupabase()
    client.from.mockReturnValue(makeChain({ data: [{ id: '1', first_name: 'Ade' }], count: 1, error: null }))

    const res = await request(makeApp()).get('/api/admin/signers')

    expect(res.status).toBe(200)
    expect(res.body.signers).toHaveLength(1)
    expect(res.body.total).toBe(1)
  })

  it('returns empty signers with total 0 when no results', async () => {
    const client = getSupabase()
    client.from.mockReturnValue(makeChain({ data: [], count: 0, error: null }))

    const res = await request(makeApp()).get('/api/admin/signers')

    expect(res.body.signers).toEqual([])
    expect(res.body.total).toBe(0)
  })

  it('applies search filter via ilike', async () => {
    const client = getSupabase()
    const chain = makeChain({ data: [], count: 0, error: null })
    client.from.mockReturnValue(chain)

    await request(makeApp()).get('/api/admin/signers?search=Amara')

    expect(chain.ilike).toHaveBeenCalledWith('first_name', '%Amara%')
  })

  it('applies country filter', async () => {
    const client = getSupabase()
    const chain = makeChain({ data: [], count: 0, error: null })
    client.from.mockReturnValue(chain)

    await request(makeApp()).get('/api/admin/signers?country=nigeria')

    const calls = chain.eq.mock.calls
    expect(calls.some(([field, val]) => field === 'country' && val === 'nigeria')).toBe(true)
  })

  it('applies wave filter', async () => {
    const client = getSupabase()
    const chain = makeChain({ data: [], count: 0, error: null })
    client.from.mockReturnValue(chain)

    await request(makeApp()).get('/api/admin/signers?wave=fintech')

    const calls = chain.eq.mock.calls
    expect(calls.some(([field, val]) => field === 'wave_tag' && val === 'fintech')).toBe(true)
  })

  it('returns 500 on Supabase error', async () => {
    const client = getSupabase()
    client.from.mockReturnValue(makeChain({ data: null, count: null, error: { message: 'DB fail' } }))

    const res = await request(makeApp()).get('/api/admin/signers')

    expect(res.status).toBe(500)
  })

  it('paginates correctly — page 0 = range(0, 19)', async () => {
    const client = getSupabase()
    const chain = makeChain({ data: [], count: 0, error: null })
    client.from.mockReturnValue(chain)

    await request(makeApp()).get('/api/admin/signers?page=0')

    expect(chain.range).toHaveBeenCalledWith(0, 19)
  })

  it('paginates to second page — page 1 = range(20, 39)', async () => {
    const client = getSupabase()
    const chain = makeChain({ data: [], count: 0, error: null })
    client.from.mockReturnValue(chain)

    await request(makeApp()).get('/api/admin/signers?page=1')

    expect(chain.range).toHaveBeenCalledWith(20, 39)
  })

  it('rejects negative page values — clamps to 0', async () => {
    const client = getSupabase()
    const chain = makeChain({ data: [], count: 0, error: null })
    client.from.mockReturnValue(chain)

    await request(makeApp()).get('/api/admin/signers?page=-5')

    // Math.max(0, -5) = 0 → range(0, 19)
    expect(chain.range).toHaveBeenCalledWith(0, 19)
  })
})

describe('DELETE /api/admin/signers/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes a signer and returns success', async () => {
    const client = getSupabase()
    client.from.mockReturnValue(makeChain({ error: null }))

    const res = await request(makeApp()).delete('/api/admin/signers/signer-uuid-1')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('returns 500 on delete error', async () => {
    const client = getSupabase()
    client.from.mockReturnValue(makeChain({ error: { message: 'FK constraint' } }))

    const res = await request(makeApp()).delete('/api/admin/signers/bad-id')

    expect(res.status).toBe(500)
  })
})
