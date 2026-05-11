import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// Shared create mock so tests can reference it
const createMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      constructor() {
        this.messages = { create: createMock }
      }
    },
  }
})

vi.mock('../middleware/rateLimiter.js', () => ({
  apiLimiter: (_req, _res, next) => next(),
  manifestoLimiter: (_req, _res, next) => next(),
  claudeLimiter: (_req, _res, next) => next(),
}))

import claudeRoutes from '../routes/claude.js'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/claude', claudeRoutes)
  return app
}

describe('POST /api/claude', () => {
  beforeEach(() => {
    createMock.mockReset()
    process.env.ANTHROPIC_API_KEY = 'test-key'
  })

  it('returns a generated caption for a valid request', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'Building the future of African fintech. #NotWaiting' }],
    })

    const res = await request(makeApp())
      .post('/api/claude')
      .send({ waveTag: 'fintech', subject: 'me' })

    expect(res.status).toBe(200)
    expect(res.body.caption).toContain('#NotWaiting')
  })

  it('returns 422 when waveTag and customPrompt are both missing', async () => {
    const res = await request(makeApp())
      .post('/api/claude')
      .send({ subject: 'me' })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/waveTag/i)
  })

  it('allows customPrompt without waveTag', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'Custom caption here. #NotWaiting' }],
    })

    const res = await request(makeApp())
      .post('/api/claude')
      .send({ customPrompt: 'Write something inspiring about tech in Africa' })

    expect(res.status).toBe(200)
    expect(typeof res.body.caption).toBe('string')
  })

  it('returns 422 when Claude responds with DECLINED', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'DECLINED' }],
    })

    const res = await request(makeApp())
      .post('/api/claude')
      .send({ waveTag: 'tech', subject: 'me', detail: 'something harmful' })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/outside/i)
  })

  it('returns 500 when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY

    const res = await request(makeApp())
      .post('/api/claude')
      .send({ waveTag: 'tech' })

    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/not configured/i)

    process.env.ANTHROPIC_API_KEY = 'test-key'
  })

  it('returns 503 on Anthropic SDK error', async () => {
    createMock.mockRejectedValue(new Error('API overloaded'))

    const res = await request(makeApp())
      .post('/api/claude')
      .send({ waveTag: 'health', subject: 'organisation' })

    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/temporarily unavailable/i)
  })

  it('truncates detail to 120 characters before sending to Claude', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'Caption. #NotWaiting' }] })

    await request(makeApp())
      .post('/api/claude')
      .send({ waveTag: 'tech', subject: 'me', detail: 'A'.repeat(200) })

    const callArgs = createMock.mock.calls[0][0]
    const userMessage = callArgs.messages[0].content
    expect(userMessage).not.toContain('A'.repeat(121))
  })

  it('truncates customPrompt to 500 characters before sending to Claude', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'Caption. #NotWaiting' }] })

    await request(makeApp())
      .post('/api/claude')
      .send({ customPrompt: 'B'.repeat(600) })

    const callArgs = createMock.mock.calls[0][0]
    const userMessage = callArgs.messages[0].content
    expect(userMessage.length).toBeLessThanOrEqual(500)
  })

  it('uses claude-haiku model for cost efficiency', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'Caption. #NotWaiting' }] })

    await request(makeApp())
      .post('/api/claude')
      .send({ waveTag: 'music' })

    const callArgs = createMock.mock.calls[0][0]
    expect(callArgs.model).toMatch(/haiku/i)
  })

  it('caps max_tokens at 300 to limit API cost', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'Caption. #NotWaiting' }] })

    await request(makeApp())
      .post('/api/claude')
      .send({ waveTag: 'tech' })

    const callArgs = createMock.mock.calls[0][0]
    expect(callArgs.max_tokens).toBeLessThanOrEqual(300)
  })
})
