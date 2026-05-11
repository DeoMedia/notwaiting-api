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

import storiesRoutes from '../routes/stories.js'
import { getSupabase } from '../lib/supabase.js'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/stories', storiesRoutes)
  return app
}

// Thenable query chain: all methods return `this`; resolves when awaited
function makeChain(result) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject)
    },
  }
  return chain
}

describe('GET /api/stories', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns stories array on success', async () => {
    const client = getSupabase()
    client.from.mockReturnValue(makeChain({ data: [{ id: '1', caption: 'hello' }], error: null }))

    const res = await request(makeApp()).get('/api/stories')

    expect(res.status).toBe(200)
    expect(res.body.stories).toHaveLength(1)
  })

  it('returns empty array when no stories exist', async () => {
    const client = getSupabase()
    client.from.mockReturnValue(makeChain({ data: [], error: null }))

    const res = await request(makeApp()).get('/api/stories')

    expect(res.status).toBe(200)
    expect(res.body.stories).toEqual([])
  })

  it('returns 500 on Supabase error', async () => {
    const client = getSupabase()
    client.from.mockReturnValue(makeChain({ data: null, error: { message: 'DB error' } }))

    const res = await request(makeApp()).get('/api/stories')

    expect(res.status).toBe(500)
  })

  it('applies wave filter when ?wave= is provided', async () => {
    const client = getSupabase()
    const chain = makeChain({ data: [], error: null })
    client.from.mockReturnValue(chain)

    await request(makeApp()).get('/api/stories?wave=fintech')

    const calls = chain.eq.mock.calls
    expect(calls.some(([field, val]) => field === 'wave_tag' && val === 'fintech')).toBe(true)
  })

  it('applies country filter when ?country= is provided', async () => {
    const client = getSupabase()
    const chain = makeChain({ data: [], error: null })
    client.from.mockReturnValue(chain)

    await request(makeApp()).get('/api/stories?country=nigeria')

    const calls = chain.eq.mock.calls
    expect(calls.some(([field, val]) => field === 'country' && val === 'nigeria')).toBe(true)
  })

  it('limits page size to max 50', async () => {
    const client = getSupabase()
    const chain = makeChain({ data: [], error: null })
    client.from.mockReturnValue(chain)

    await request(makeApp()).get('/api/stories?limit=999')

    const [start, end] = chain.range.mock.calls[0]
    expect(end - start).toBeLessThanOrEqual(49)
  })

  it('limit=0 is clamped to 1', async () => {
    const client = getSupabase()
    const chain = makeChain({ data: [], error: null })
    client.from.mockReturnValue(chain)

    await request(makeApp()).get('/api/stories?limit=0')

    const [start, end] = chain.range.mock.calls[0]
    expect(end).toBeGreaterThanOrEqual(0)
    expect(end - start).toBeGreaterThanOrEqual(0)
  })

  it('always filters for is_visible=true', async () => {
    const client = getSupabase()
    const chain = makeChain({ data: [], error: null })
    client.from.mockReturnValue(chain)

    await request(makeApp()).get('/api/stories')

    const calls = chain.eq.mock.calls
    expect(calls.some(([field, val]) => field === 'is_visible' && val === true)).toBe(true)
  })
})

describe('POST /api/stories', () => {
  beforeEach(() => vi.clearAllMocks())

  it('publishes a story via upsert and returns 201', async () => {
    const client = getSupabase()
    const fakeStory = { id: 'story-1', caption: 'Building fin...' }

    client.from
      // 1. signer lookup
      .mockReturnValueOnce(makeChain({ data: { id: 's1', first_name: 'Amara', country: 'ghana' }, error: null }))
      // 2. upsert → story returned
      .mockReturnValueOnce(makeChain({ data: fakeStory, error: null }))
      // 3. action insert
      .mockReturnValueOnce(makeChain({ error: null }))

    const res = await request(makeApp())
      .post('/api/stories')
      .send({ signerId: 's1', caption: 'Building fin...', waveTag: 'fintech' })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.story.id).toBe('story-1')
  })

  it('uses upsert — no separate delete step', async () => {
    const client = getSupabase()
    const upsertChain = makeChain({ data: { id: 'story-1' }, error: null })

    client.from
      .mockReturnValueOnce(makeChain({ data: { id: 's1', first_name: 'A', country: 'ng' }, error: null }))
      .mockReturnValueOnce(upsertChain)
      .mockReturnValueOnce(makeChain({ error: null }))

    await request(makeApp())
      .post('/api/stories')
      .send({ signerId: 's1', caption: 'Story content', waveTag: 'tech' })

    expect(upsertChain.upsert).toHaveBeenCalled()
    expect(upsertChain.delete).not.toHaveBeenCalled()
  })

  it('passes onConflict: signer_id to upsert', async () => {
    const client = getSupabase()
    const upsertChain = makeChain({ data: { id: 'story-1' }, error: null })

    client.from
      .mockReturnValueOnce(makeChain({ data: { id: 's1', first_name: 'A', country: 'ng' }, error: null }))
      .mockReturnValueOnce(upsertChain)
      .mockReturnValueOnce(makeChain({ error: null }))

    await request(makeApp())
      .post('/api/stories')
      .send({ signerId: 's1', caption: 'Story', waveTag: 'tech' })

    const [, options] = upsertChain.upsert.mock.calls[0]
    expect(options).toMatchObject({ onConflict: 'signer_id' })
  })

  it('returns 422 when signerId is missing', async () => {
    const res = await request(makeApp())
      .post('/api/stories')
      .send({ caption: 'Hello', waveTag: 'tech' })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/signerId/i)
  })

  it('returns 422 when caption is empty', async () => {
    const res = await request(makeApp())
      .post('/api/stories')
      .send({ signerId: 'abc', caption: '   ', waveTag: 'tech' })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/caption/i)
  })

  it('returns 422 when caption exceeds 600 characters', async () => {
    const res = await request(makeApp())
      .post('/api/stories')
      .send({ signerId: 'abc', caption: 'A'.repeat(601), waveTag: 'tech' })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/too long/i)
  })

  it('returns 422 when waveTag is missing', async () => {
    const res = await request(makeApp())
      .post('/api/stories')
      .send({ signerId: 'abc', caption: 'Hello world' })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/waveTag/i)
  })

  it('returns 422 when waveTag is only whitespace after trim', async () => {
    const res = await request(makeApp())
      .post('/api/stories')
      .send({ signerId: 'abc', caption: 'Hello', waveTag: '   ' })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/invalid waveTag/i)
  })

  it('strips HTML chars from waveTag before storing', async () => {
    const client = getSupabase()
    const upsertChain = makeChain({ data: { id: 'story-1' }, error: null })

    client.from
      .mockReturnValueOnce(makeChain({ data: { id: 's1', first_name: 'A', country: 'ng' }, error: null }))
      .mockReturnValueOnce(upsertChain)
      .mockReturnValueOnce(makeChain({ error: null }))

    await request(makeApp())
      .post('/api/stories')
      .send({ signerId: 's1', caption: 'Hello', waveTag: '<script>tech</script>' })

    const [upsertData] = upsertChain.upsert.mock.calls[0]
    expect(upsertData.wave_tag).not.toContain('<')
    expect(upsertData.wave_tag).not.toContain('>')
    expect(upsertData.wave_tag).toContain('tech')
  })

  it('truncates waveTag to 60 characters', async () => {
    const client = getSupabase()
    const upsertChain = makeChain({ data: { id: 'story-1' }, error: null })

    client.from
      .mockReturnValueOnce(makeChain({ data: { id: 's1', first_name: 'A', country: 'ng' }, error: null }))
      .mockReturnValueOnce(upsertChain)
      .mockReturnValueOnce(makeChain({ error: null }))

    await request(makeApp())
      .post('/api/stories')
      .send({ signerId: 's1', caption: 'Hello', waveTag: 'x'.repeat(100) })

    const [upsertData] = upsertChain.upsert.mock.calls[0]
    expect(upsertData.wave_tag.length).toBeLessThanOrEqual(60)
  })

  it('returns 404 when signer does not exist', async () => {
    const client = getSupabase()
    client.from.mockReturnValueOnce(makeChain({ data: null, error: { message: 'Not found' } }))

    const res = await request(makeApp())
      .post('/api/stories')
      .send({ signerId: 'nonexistent', caption: 'Hello', waveTag: 'tech' })

    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/signer not found/i)
  })

  it('returns 500 on upsert error', async () => {
    const client = getSupabase()
    client.from
      .mockReturnValueOnce(makeChain({ data: { id: 's1', first_name: 'A', country: 'ng' }, error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: { message: 'Upsert failed' } }))

    const res = await request(makeApp())
      .post('/api/stories')
      .send({ signerId: 's1', caption: 'Hello', waveTag: 'tech' })

    expect(res.status).toBe(500)
  })

  it('trims whitespace from caption before storing', async () => {
    const client = getSupabase()
    const upsertChain = makeChain({ data: { id: 'story-1' }, error: null })

    client.from
      .mockReturnValueOnce(makeChain({ data: { id: 's1', first_name: 'A', country: 'ng' }, error: null }))
      .mockReturnValueOnce(upsertChain)
      .mockReturnValueOnce(makeChain({ error: null }))

    await request(makeApp())
      .post('/api/stories')
      .send({ signerId: 's1', caption: '   Trimmed caption   ', waveTag: 'tech' })

    const [upsertData] = upsertChain.upsert.mock.calls[0]
    expect(upsertData.caption).toBe('Trimmed caption')
  })
})
