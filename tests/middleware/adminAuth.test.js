import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

import { requireAdmin } from '../../middleware/adminAuth.js'

// ── Mock @supabase/supabase-js ─────────────────────────────────────────────
// Each test sets its own mock by replacing createClient implementation.
const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@supabase/supabase-js'

function setAnonClient(getUserImpl) {
  return { auth: { getUser: getUserImpl } }
}

function setServiceClient(fromImpl) {
  return { from: fromImpl }
}

// Each test call creates anon first then service client
function mockClients(anonClient, serviceClient) {
  let callCount = 0
  createClient.mockImplementation(() => {
    callCount++
    return callCount === 1 ? anonClient : serviceClient
  })
}

function makeApp(role = 'content_manager') {
  const app = express()
  app.use(express.json())
  app.get('/protected', requireAdmin(role), (req, res) => {
    res.json({ ok: true, adminUser: req.adminUser })
  })
  return app
}

describe('requireAdmin middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(makeApp()).get('/protected')
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/no token/i)
  })

  it('returns 401 when JWT validation fails (invalid token)', async () => {
    const anonClient = setAnonClient(
      vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'Invalid JWT' } })
    )
    mockClients(anonClient, {})

    const res = await request(makeApp())
      .get('/protected')
      .set('Authorization', 'Bearer invalid.jwt.token')

    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/invalid or expired/i)
  })

  it('returns 403 when user has no admin_users record', async () => {
    const anonClient = setAnonClient(
      vi.fn().mockResolvedValue({ data: { user: { id: 'user-1', email: 'u@t.com' } }, error: null })
    )
    const serviceClient = setServiceClient(
      vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
          }),
        }),
      })
    )
    mockClients(anonClient, serviceClient)

    const res = await request(makeApp())
      .get('/protected')
      .set('Authorization', 'Bearer valid.jwt.token')

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/no admin access/i)
  })

  it('returns 200 and attaches adminUser when valid content_manager token', async () => {
    const anonClient = setAnonClient(
      vi.fn().mockResolvedValue({ data: { user: { id: 'user-cm', email: 'cm@test.com' } }, error: null })
    )
    const serviceClient = setServiceClient(
      vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { role: 'content_manager' }, error: null }),
          }),
        }),
      })
    )
    mockClients(anonClient, serviceClient)

    const res = await request(makeApp('content_manager'))
      .get('/protected')
      .set('Authorization', 'Bearer valid.cm.token')

    expect(res.status).toBe(200)
    expect(res.body.adminUser.role).toBe('content_manager')
    expect(res.body.adminUser.email).toBe('cm@test.com')
  })

  it('returns 403 when content_manager tries to access super_admin route', async () => {
    const anonClient = setAnonClient(
      vi.fn().mockResolvedValue({ data: { user: { id: 'user-cm', email: 'cm@test.com' } }, error: null })
    )
    const serviceClient = setServiceClient(
      vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { role: 'content_manager' }, error: null }),
          }),
        }),
      })
    )
    mockClients(anonClient, serviceClient)

    const res = await request(makeApp('super_admin'))
      .get('/protected')
      .set('Authorization', 'Bearer valid.cm.token')

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/super admin/i)
  })

  it('returns 200 when super_admin accesses super_admin route', async () => {
    const anonClient = setAnonClient(
      vi.fn().mockResolvedValue({ data: { user: { id: 'user-sa', email: 'sa@test.com' } }, error: null })
    )
    const serviceClient = setServiceClient(
      vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { role: 'super_admin' }, error: null }),
          }),
        }),
      })
    )
    mockClients(anonClient, serviceClient)

    const res = await request(makeApp('super_admin'))
      .get('/protected')
      .set('Authorization', 'Bearer valid.sa.token')

    expect(res.status).toBe(200)
    expect(res.body.adminUser.role).toBe('super_admin')
  })

  it('returns 500 when auth service throws unexpectedly', async () => {
    const anonClient = setAnonClient(
      vi.fn().mockRejectedValue(new Error('Supabase connection failed'))
    )
    mockClients(anonClient, {})

    const res = await request(makeApp())
      .get('/protected')
      .set('Authorization', 'Bearer some.valid.token')

    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/auth check failed/i)
  })
})
