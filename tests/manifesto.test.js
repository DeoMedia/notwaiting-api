import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// ── Mock Supabase before importing routes ──────────────────────────────
vi.mock('../lib/supabase.js', () => {
  const mockSingle = vi.fn()
  const mockSelect = vi.fn(() => ({ single: mockSingle, data: null, error: null }))
  const mockInsert = vi.fn(() => ({ select: () => ({ single: mockSingle }) }))
  const mockFrom = vi.fn(() => ({ insert: mockInsert, select: mockSelect }))
  const client = { from: mockFrom }
  return { getSupabase: vi.fn(() => client), _mockFrom: mockFrom, _mockInsert: mockInsert, _mockSingle: mockSingle, _mockSelect: mockSelect }
})

// Mock rate limiter to be a no-op in tests
vi.mock('../middleware/rateLimiter.js', () => ({
  apiLimiter: (_req, _res, next) => next(),
  manifestoLimiter: (_req, _res, next) => next(),
  claudeLimiter: (_req, _res, next) => next(),
}))

import manifestoRoutes from '../routes/manifesto.js'
import * as supabaseModule from '../lib/supabase.js'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/manifesto', manifestoRoutes)
  return app
}

// Helper to get at the mock chain
function mockSupabase() {
  return supabaseModule.getSupabase()
}

describe('POST /api/manifesto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('signs the manifesto with valid data and returns 201 + signerId', async () => {
    const mockClient = mockSupabase()
    // Signer insert chain: from → insert → select → single
    const signerResult = { data: { id: 'signer-uuid-1' }, error: null }
    // Action insert chain: from → insert
    const actionResult = { error: null }

    mockClient.from
      .mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue(signerResult) }) })
      })
      .mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue(actionResult)
      })

    const res = await request(makeApp())
      .post('/api/manifesto')
      .send({ firstName: 'Amara', country: 'nigeria', email: 'amara@example.com', wave: 'I build in fintech' })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.signerId).toBe('signer-uuid-1')
  })

  it('returns 422 when firstName is missing', async () => {
    const res = await request(makeApp())
      .post('/api/manifesto')
      .send({ country: 'ghana' })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/first name/i)
  })

  it('returns 422 when country is missing', async () => {
    const res = await request(makeApp())
      .post('/api/manifesto')
      .send({ firstName: 'Kwame', email: 'kwame@example.com' })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/country/i)
  })

  it('returns 422 when email is missing', async () => {
    const res = await request(makeApp())
      .post('/api/manifesto')
      .send({ firstName: 'Kwame', country: 'ghana' })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/email/i)
  })

  it('returns 422 when email is invalid', async () => {
    const res = await request(makeApp())
      .post('/api/manifesto')
      .send({ firstName: 'Kwame', country: 'ghana', email: 'not-an-email' })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/valid email/i)
  })

  it('returns 422 when both firstName and country are missing', async () => {
    const res = await request(makeApp())
      .post('/api/manifesto')
      .send({})

    expect(res.status).toBe(422)
  })

  it('returns 409 on duplicate signer (error code 23505)', async () => {
    const mockClient = mockSupabase()
    mockClient.from.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: '23505' } })
        })
      })
    })

    const res = await request(makeApp())
      .post('/api/manifesto')
      .send({ firstName: 'Duplicate', country: 'kenya', email: 'dup@example.com' })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already been used to sign/i)
  })

  it('returns 500 on unexpected Supabase insert error', async () => {
    const mockClient = mockSupabase()
    mockClient.from.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: '50000', message: 'DB error' } })
        })
      })
    })

    const res = await request(makeApp())
      .post('/api/manifesto')
      .send({ firstName: 'Test', country: 'nigeria', email: 'test@example.com' })

    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/could not save/i)
  })

  it('sanitises XSS characters from firstName', async () => {
    const mockClient = mockSupabase()
    let insertedFirstName = null

    mockClient.from.mockReturnValueOnce({
      insert: vi.fn().mockImplementation((data) => {
        insertedFirstName = data.first_name
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'uuid-1' }, error: null })
          })
        }
      })
    }).mockReturnValueOnce({
      insert: vi.fn().mockResolvedValue({ error: null })
    })

    await request(makeApp())
      .post('/api/manifesto')
      .send({ firstName: '<script>alert(1)</script>', country: 'ghana', email: 'xss@example.com' })

    expect(insertedFirstName).not.toContain('<')
    expect(insertedFirstName).not.toContain('>')
  })

  it('truncates firstName to 60 characters', async () => {
    const mockClient = mockSupabase()
    let insertedFirstName = null

    mockClient.from.mockReturnValueOnce({
      insert: vi.fn().mockImplementation((data) => {
        insertedFirstName = data.first_name
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'uuid-1' }, error: null })
          })
        }
      })
    }).mockReturnValueOnce({
      insert: vi.fn().mockResolvedValue({ error: null })
    })

    const longName = 'A'.repeat(100)
    await request(makeApp())
      .post('/api/manifesto')
      .send({ firstName: longName, country: 'ghana', email: 'trunc@example.com' })

    expect(insertedFirstName.length).toBeLessThanOrEqual(60)
  })

  it('infers wave_tag=fintech from wave text containing "fintech"', async () => {
    const mockClient = mockSupabase()
    let insertedData = null

    mockClient.from.mockReturnValueOnce({
      insert: vi.fn().mockImplementation((data) => {
        insertedData = data
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'uuid-1' }, error: null })
          })
        }
      })
    }).mockReturnValueOnce({
      insert: vi.fn().mockResolvedValue({ error: null })
    })

    await request(makeApp())
      .post('/api/manifesto')
      .send({ firstName: 'Temi', country: 'nigeria', email: 'temi@example.com', wave: 'Building a fintech startup' })

    expect(insertedData.wave_tag).toBe('fintech')
  })

  it('maps "finance" wave text to canonical tag "fintech"', async () => {
    const mockClient = mockSupabase()
    let insertedData = null

    mockClient.from.mockReturnValueOnce({
      insert: vi.fn().mockImplementation((data) => {
        insertedData = data
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'uuid-1' }, error: null })
          })
        }
      })
    }).mockReturnValueOnce({
      insert: vi.fn().mockResolvedValue({ error: null })
    })

    await request(makeApp())
      .post('/api/manifesto')
      .send({ firstName: 'Test', country: 'nigeria', email: 'test1@example.com', wave: 'I work in finance' })

    expect(insertedData.wave_tag).toBe('fintech')
  })

  it('maps "technology" wave text to canonical tag "tech"', async () => {
    const mockClient = mockSupabase()
    let insertedData = null

    mockClient.from.mockReturnValueOnce({
      insert: vi.fn().mockImplementation((data) => {
        insertedData = data
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'uuid-1' }, error: null })
          })
        }
      })
    }).mockReturnValueOnce({
      insert: vi.fn().mockResolvedValue({ error: null })
    })

    await request(makeApp())
      .post('/api/manifesto')
      .send({ firstName: 'Test', country: 'nigeria', email: 'test2@example.com', wave: 'Building in technology' })

    expect(insertedData.wave_tag).toBe('tech')
  })

  it('infers null wave_tag for unrecognised wave text', async () => {
    const mockClient = mockSupabase()
    let insertedData = null

    mockClient.from.mockReturnValueOnce({
      insert: vi.fn().mockImplementation((data) => {
        insertedData = data
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'uuid-1' }, error: null })
          })
        }
      })
    }).mockReturnValueOnce({
      insert: vi.fn().mockResolvedValue({ error: null })
    })

    await request(makeApp())
      .post('/api/manifesto')
      .send({ firstName: 'Test', country: 'nigeria', email: 'test3@example.com', wave: 'I build in pottery' })

    expect(insertedData.wave_tag).toBeNull()
  })

  it('stores action record after successful signing', async () => {
    const mockClient = mockSupabase()
    let actionData = null

    mockClient.from
      .mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'signer-id-99' }, error: null })
          })
        })
      })
      .mockReturnValueOnce({
        insert: vi.fn().mockImplementation((data) => {
          actionData = data
          return Promise.resolve({ error: null })
        })
      })

    await request(makeApp())
      .post('/api/manifesto')
      .send({ firstName: 'Ade', country: 'nigeria', email: 'ade@example.com' })

    expect(actionData.action).toBe('signed')
    expect(actionData.signer_id).toBe('signer-id-99')
  })
})

describe('GET /api/manifesto/count', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns total_signers and total_countries', async () => {
    const mockClient = mockSupabase()
    mockClient.from.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { total_signers: 1500, total_countries: 30 },
          error: null,
        })
      })
    })

    const res = await request(makeApp()).get('/api/manifesto/count')

    expect(res.status).toBe(200)
    expect(res.body.total_signers).toBe(1500)
    expect(res.body.total_countries).toBe(30)
  })

  it('returns 500 on Supabase error', async () => {
    const mockClient = mockSupabase()
    mockClient.from.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB down' } })
      })
    })

    const res = await request(makeApp()).get('/api/manifesto/count')

    expect(res.status).toBe(500)
  })
})
