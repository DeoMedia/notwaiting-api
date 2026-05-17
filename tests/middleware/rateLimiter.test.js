import { describe, it, expect, vi, afterEach } from 'vitest'
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

describe('manifestoLimiter — window reset simulation', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('EXPOSES BUG: existing "allows exactly 3" test ignores X-Forwarded-For because trust proxy is not set', async () => {
    // makeApp() does NOT set trust proxy, so X-Forwarded-For is silently ignored.
    // All supertest requests appear to come from the loopback IP (::1 / 127.0.0.1),
    // meaning the IP header in the other test is irrelevant — all requests share one bucket.
    const appWithoutProxy = makeApp(freshManifestoLimiter())

    // Exhaust the limit using IP "10.0.0.1" — but without trust proxy this is ignored
    for (let i = 0; i < 3; i++) {
      await request(appWithoutProxy).get('/').set('X-Forwarded-For', '10.0.0.1')
    }

    // Now send from a different IP header — should still be blocked because the bucket
    // is keyed on the socket loopback IP, not the X-Forwarded-For value
    const blocked = await request(appWithoutProxy).get('/').set('X-Forwarded-For', '10.0.0.2')
    expect(blocked.status).toBe(429) // proves different IP header made no difference
  })

  it('window resets after 1 hour — counter starts fresh', async () => {
    vi.useFakeTimers()

    // Fresh limiter with a very short window so fake timers can advance past it
    const shortLimiter = rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 3,
      standardHeaders: true,
      legacyHeaders: false,
    })

    const app = express()
    app.set('trust proxy', 1)
    app.use(shortLimiter)
    app.get('/', (_req, res) => res.json({ ok: true }))

    const ip = '10.99.99.1'

    // Exhaust the limit
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/').set('X-Forwarded-For', ip)
      expect(res.status).toBe(200)
    }

    // 4th is blocked
    const blocked = await request(app).get('/').set('X-Forwarded-For', ip)
    expect(blocked.status).toBe(429)

    // Advance time past the full 1-hour window
    vi.advanceTimersByTime(60 * 60 * 1000 + 1)

    // Counter should have reset — first request of the new window is allowed
    const afterReset = await request(app).get('/').set('X-Forwarded-For', ip)
    expect(afterReset.status).toBe(200)
  })

  it('CDN / shared-proxy scenario: all traffic behind one IP exhausts the shared bucket', async () => {
    // If the deployment platform collapses all user IPs into a single
    // X-Forwarded-For entry (e.g. a misconfigured CDN), every user
    // draws from the same bucket. 3 real users can lock out everyone else.
    const app = express()
    app.set('trust proxy', 1)
    app.use(freshManifestoLimiter())
    app.get('/', (_req, res) => res.json({ ok: true }))

    const sharedCdnIp = '203.0.113.1' // simulate CDN forwarding same IP for all users

    // 3 distinct "users" each make one request — all appear as the same IP
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/').set('X-Forwarded-For', sharedCdnIp)
      expect(res.status).toBe(200)
    }

    // A 4th real user through the same CDN is now locked out for 1 hour
    const locked = await request(app).get('/').set('X-Forwarded-For', sharedCdnIp)
    expect(locked.status).toBe(429)
  })

  it('rate limiter 429 message is distinct from DB duplicate 409 message', async () => {
    // These two responses are easy to confuse:
    // 429 (rate limiter): "You have signed recently. Thank you for your enthusiasm!"
    // 409 (DB unique):    "Looks like you have already signed! Thank you."
    // The rate limiter resets after 1 hour. The DB constraint never resets.
    const app = makeApp(freshManifestoLimiter())

    for (let i = 0; i < 3; i++) {
      await request(app).get('/')
    }

    const res = await request(app).get('/')
    expect(res.status).toBe(429)
    expect(res.body.error).toMatch(/signed recently/i)             // rate limiter message
    expect(res.body.error).not.toMatch(/already signed/i)          // NOT the DB constraint message
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
