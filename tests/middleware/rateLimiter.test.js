import { describe, it, expect } from 'vitest'
import request from 'supertest'
import express from 'express'
import rateLimit from 'express-rate-limit'

// Create fresh limiter instances per test to avoid shared in-memory state
function freshApiLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again in a few minutes.' },
  })
}

function freshManifestoLimiter() {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'You have signed recently. Thank you for your enthusiasm!' },
  })
}

function freshClaudeLimiter() {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Caption limit reached (10/hour). Come back later!' },
  })
}

function makeApp(limiter) {
  const app = express()
  app.use(limiter)
  app.get('/', (_req, res) => res.json({ ok: true }))
  return app
}

describe('apiLimiter', () => {
  it('allows the first request through', async () => {
    const res = await request(makeApp(freshApiLimiter())).get('/')
    expect(res.status).toBe(200)
  })

  it('sets RateLimit-Limit header', async () => {
    const res = await request(makeApp(freshApiLimiter())).get('/')
    expect(res.headers['ratelimit-limit']).toBeDefined()
  })

  it('does NOT set legacy X-RateLimit headers (standardHeaders only)', async () => {
    const res = await request(makeApp(freshApiLimiter())).get('/')
    expect(res.headers['x-ratelimit-limit']).toBeUndefined()
  })

  it('correct limit is 100 requests per 15 minutes', async () => {
    const res = await request(makeApp(freshApiLimiter())).get('/')
    expect(res.headers['ratelimit-limit']).toBe('100')
  })
})

describe('manifestoLimiter', () => {
  it('allows the first request through', async () => {
    const res = await request(makeApp(freshManifestoLimiter())).get('/')
    expect(res.status).toBe(200)
  })

  it('allows exactly 3 requests then blocks the 4th', async () => {
    const app = makeApp(freshManifestoLimiter())
    const ip = '10.10.10.1'

    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/').set('X-Forwarded-For', ip)
      expect(res.status).toBe(200)
    }

    const blocked = await request(app).get('/').set('X-Forwarded-For', ip)
    expect(blocked.status).toBe(429)
    expect(blocked.body.error).toMatch(/signed recently/i)
  })

  it('trust proxy enabled — different IPs have independent rate limit buckets', async () => {
    // index.js now sets app.set('trust proxy', 1), so X-Forwarded-For is respected
    // and each real client IP gets its own quota behind a load balancer.
    const app = express()
    app.set('trust proxy', 1)
    app.use(freshManifestoLimiter())
    app.get('/', (_req, res) => res.json({ ok: true }))

    // Exhaust limit for IP1
    for (let i = 0; i < 3; i++) {
      await request(app).get('/').set('X-Forwarded-For', '10.10.10.2')
    }
    await request(app).get('/').set('X-Forwarded-For', '10.10.10.2') // 429

    // IP2 is unaffected — only works with trust proxy enabled
    const res = await request(app).get('/').set('X-Forwarded-For', '10.10.10.3')
    expect(res.status).toBe(200)
  })

  it('correct limit is 3 requests per hour', async () => {
    const res = await request(makeApp(freshManifestoLimiter())).get('/')
    expect(res.headers['ratelimit-limit']).toBe('3')
  })
})

describe('claudeLimiter', () => {
  it('allows the first request through', async () => {
    const res = await request(makeApp(freshClaudeLimiter())).get('/')
    expect(res.status).toBe(200)
  })

  it('allows exactly 10 requests then blocks the 11th', async () => {
    const app = makeApp(freshClaudeLimiter())
    const ip = '10.20.20.1'

    for (let i = 0; i < 10; i++) {
      const res = await request(app).get('/').set('X-Forwarded-For', ip)
      expect(res.status).toBe(200)
    }

    const blocked = await request(app).get('/').set('X-Forwarded-For', ip)
    expect(blocked.status).toBe(429)
    expect(blocked.body.error).toMatch(/caption limit/i)
  })

  it('correct limit is 10 requests per hour', async () => {
    const res = await request(makeApp(freshClaudeLimiter())).get('/')
    expect(res.headers['ratelimit-limit']).toBe('10')
  })
})
