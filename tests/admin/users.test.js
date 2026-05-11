import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// Mock @supabase/supabase-js createClient used directly in users.js
vi.mock('@supabase/supabase-js', () => {
  const adminGetUserById = vi.fn()
  const adminInviteUserByEmail = vi.fn()
  const adminDeleteUser = vi.fn()

  const serviceClient = {
    from: vi.fn(),
    auth: {
      admin: {
        getUserById: adminGetUserById,
        inviteUserByEmail: adminInviteUserByEmail,
        deleteUser: adminDeleteUser,
      },
    },
  }

  return {
    createClient: vi.fn(() => serviceClient),
    _serviceClient: serviceClient,
  }
})

vi.mock('../../lib/supabase.js', () => {
  const client = { from: vi.fn() }
  return { getSupabase: vi.fn(() => client) }
})

vi.mock('../../middleware/adminAuth.js', () => ({
  requireAdmin: (role) => (req, _res, next) => {
    req.adminUser = { id: 'admin-user-id', email: 'admin@test.com', role }
    next()
  },
}))

import adminUsersRoutes from '../../routes/admin/users.js'
import { getSupabase } from '../../lib/supabase.js'
import { createClient } from '@supabase/supabase-js'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/admin/users', adminUsersRoutes)
  return app
}

function getServiceClient() {
  return createClient()
}

describe('GET /api/admin/users', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns list of admin users with emails', async () => {
    const client = getSupabase()
    client.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [{ user_id: 'u1', role: 'content_manager', created_at: '2026-01-01' }],
          error: null,
        }),
      }),
    })

    const sc = getServiceClient()
    sc.auth.admin.getUserById.mockResolvedValue({ data: { user: { email: 'user@test.com' } } })

    const res = await request(makeApp()).get('/api/admin/users')

    expect(res.status).toBe(200)
    expect(res.body.users).toHaveLength(1)
    expect(res.body.users[0].email).toBe('user@test.com')
  })

  it('uses "unknown" for users where email lookup fails', async () => {
    const client = getSupabase()
    client.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [{ user_id: 'u-missing', role: 'super_admin', created_at: '2026-01-01' }],
          error: null,
        }),
      }),
    })

    const sc = getServiceClient()
    sc.auth.admin.getUserById.mockRejectedValue(new Error('User not found'))

    const res = await request(makeApp()).get('/api/admin/users')

    expect(res.body.users[0].email).toBe('unknown')
  })

  it('returns 500 on admin_users query error', async () => {
    const client = getSupabase()
    client.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: null, error: { message: 'Table missing' } }),
      }),
    })

    const res = await request(makeApp()).get('/api/admin/users')

    expect(res.status).toBe(500)
  })
})

describe('POST /api/admin/users/invite', () => {
  beforeEach(() => vi.clearAllMocks())

  it('invites a user with content_manager role', async () => {
    const client = getSupabase()
    const sc = getServiceClient()

    sc.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: { id: 'new-user-id' } },
      error: null,
    })

    client.from.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    const res = await request(makeApp())
      .post('/api/admin/users/invite')
      .send({ email: 'new@admin.com', role: 'content_manager' })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.userId).toBe('new-user-id')
  })

  it('invites a user with super_admin role', async () => {
    const client = getSupabase()
    const sc = getServiceClient()

    sc.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: { id: 'super-id' } },
      error: null,
    })

    client.from.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })

    const res = await request(makeApp())
      .post('/api/admin/users/invite')
      .send({ email: 'super@admin.com', role: 'super_admin' })

    expect(res.status).toBe(201)
  })

  it('returns 422 for invalid email (no @ sign)', async () => {
    const res = await request(makeApp())
      .post('/api/admin/users/invite')
      .send({ email: 'notanemail', role: 'content_manager' })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/email/i)
  })

  it('returns 422 for invalid role', async () => {
    const res = await request(makeApp())
      .post('/api/admin/users/invite')
      .send({ email: 'valid@email.com', role: 'god_mode' })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/role/i)
  })

  it('returns 500 when Supabase invite fails', async () => {
    const sc = getServiceClient()
    sc.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: null,
      error: { message: 'User already registered' },
    })

    const res = await request(makeApp())
      .post('/api/admin/users/invite')
      .send({ email: 'existing@admin.com', role: 'content_manager' })

    expect(res.status).toBe(500)
  })

  it('rolls back invite when role insert fails — no orphaned auth user left behind', async () => {
    const client = getSupabase()
    const sc = getServiceClient()

    sc.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: { id: 'orphan-user-id' } },
      error: null,
    })

    client.from.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: { message: 'FK violation' } }),
    })

    sc.auth.admin.deleteUser.mockResolvedValue({ error: null })

    const res = await request(makeApp())
      .post('/api/admin/users/invite')
      .send({ email: 'orphan@admin.com', role: 'content_manager' })

    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/role could not be assigned/i)
    // Rollback: the orphaned auth user is deleted so the invite can be retried
    expect(sc.auth.admin.deleteUser).toHaveBeenCalledWith('orphan-user-id')
  })
})

describe('PATCH /api/admin/users/:userId', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates role of another admin user', async () => {
    const client = getSupabase()
    client.from.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })

    const res = await request(makeApp())
      .patch('/api/admin/users/other-user-id')
      .send({ role: 'content_manager' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('prevents admin from changing their own role', async () => {
    const res = await request(makeApp())
      .patch('/api/admin/users/admin-user-id') // same as req.adminUser.id
      .send({ role: 'content_manager' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/own role/i)
  })

  it('returns 422 for invalid role', async () => {
    const res = await request(makeApp())
      .patch('/api/admin/users/some-id')
      .send({ role: 'moderator' })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/invalid role/i)
  })

  it('returns 500 on update error', async () => {
    const client = getSupabase()
    client.from.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: { message: 'Update failed' } }),
      }),
    })

    const res = await request(makeApp())
      .patch('/api/admin/users/other-id')
      .send({ role: 'super_admin' })

    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/admin/users/:userId', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes another admin user', async () => {
    const client = getSupabase()
    const sc = getServiceClient()

    client.from.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })

    sc.auth.admin.deleteUser.mockResolvedValue({ error: null })

    const res = await request(makeApp()).delete('/api/admin/users/other-user-id')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('prevents admin from deleting themselves', async () => {
    const res = await request(makeApp()).delete('/api/admin/users/admin-user-id')

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/remove yourself/i)
  })

  it('returns 500 when Supabase auth delete fails', async () => {
    const client = getSupabase()
    const sc = getServiceClient()

    client.from.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })

    sc.auth.admin.deleteUser.mockResolvedValue({ error: { message: 'User not found in auth' } })

    const res = await request(makeApp()).delete('/api/admin/users/bad-id')

    expect(res.status).toBe(500)
  })
})
