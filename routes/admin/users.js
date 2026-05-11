// server/routes/admin/users.js
// GET    /api/admin/users           — list admin users (super_admin only)
// POST   /api/admin/users/invite    — invite a new user by email
// PATCH  /api/admin/users/:id       — update role
// DELETE /api/admin/users/:id       — remove admin access

import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import { getSupabase } from '../../lib/supabase.js'
import { requireAdmin } from '../../middleware/adminAuth.js'

const router = Router()

function getServiceClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

router.get('/', requireAdmin('super_admin'), async (req, res) => {
  const supabase = getSupabase()

  // Get all admin_users rows joined with auth user email
  const { data: adminUsers, error } = await supabase
    .from('admin_users')
    .select('user_id, role, created_at')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[admin/users GET]', error)
    return res.status(500).json({ error: 'Could not load admin users' })
  }

  // Fetch email addresses from auth.users via service role
  const serviceClient = getServiceClient()
  const userIds = (adminUsers ?? []).map(u => u.user_id)

  // Fetch each user's email from auth admin API
  const usersWithEmail = await Promise.all(
    userIds.map(async (id) => {
      try {
        const { data } = await serviceClient.auth.admin.getUserById(id)
        return { id, email: data?.user?.email ?? 'unknown' }
      } catch {
        return { id, email: 'unknown' }
      }
    })
  )

  const emailMap = Object.fromEntries(usersWithEmail.map(u => [u.id, u.email]))

  const users = (adminUsers ?? []).map(u => ({
    user_id:    u.user_id,
    role:       u.role,
    created_at: u.created_at,
    email:      emailMap[u.user_id] ?? 'unknown',
  }))

  return res.json({ users })
})

router.post('/invite', requireAdmin('super_admin'), async (req, res) => {
  const { email, role } = req.body ?? {}

  if (!email || !email.includes('@')) {
    return res.status(422).json({ error: 'Valid email is required' })
  }

  if (!['super_admin', 'content_manager'].includes(role)) {
    return res.status(422).json({ error: 'Role must be super_admin or content_manager' })
  }

  const serviceClient = getServiceClient()
  const supabase = getSupabase()

  // Send Supabase invite email
  const { data: inviteData, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(
    email,
    { redirectTo: `${process.env.ADMIN_URL ?? 'http://localhost:5200'}/login` }
  )

  if (inviteError) {
    console.error('[admin/users invite]', inviteError)
    return res.status(500).json({ error: inviteError.message })
  }

  // Create admin_users row
  const { error: roleError } = await supabase
    .from('admin_users')
    .insert({ user_id: inviteData.user.id, role })

  if (roleError) {
    console.error('[admin/users role insert]', roleError)
    // Roll back: delete the orphaned auth user so invite can be retried cleanly
    await serviceClient.auth.admin.deleteUser(inviteData.user.id)
    return res.status(500).json({ error: 'User invited but role could not be assigned' })
  }

  return res.status(201).json({ success: true, userId: inviteData.user.id })
})

router.patch('/:userId', requireAdmin('super_admin'), async (req, res) => {
  const { userId } = req.params
  const { role } = req.body ?? {}

  if (!['super_admin', 'content_manager'].includes(role)) {
    return res.status(422).json({ error: 'Invalid role' })
  }

  // Prevent demoting yourself
  if (userId === req.adminUser.id) {
    return res.status(400).json({ error: 'You cannot change your own role' })
  }

  const supabase = getSupabase()
  const { error } = await supabase
    .from('admin_users')
    .update({ role })
    .eq('user_id', userId)

  if (error) {
    console.error('[admin/users PATCH]', error)
    return res.status(500).json({ error: 'Could not update role' })
  }

  return res.json({ success: true })
})

router.delete('/:userId', requireAdmin('super_admin'), async (req, res) => {
  const { userId } = req.params

  if (userId === req.adminUser.id) {
    return res.status(400).json({ error: 'You cannot remove yourself' })
  }

  const supabase = getSupabase()
  const serviceClient = getServiceClient()

  // Remove from admin_users table
  await supabase.from('admin_users').delete().eq('user_id', userId)

  // Delete the auth user entirely
  const { error } = await serviceClient.auth.admin.deleteUser(userId)

  if (error) {
    console.error('[admin/users DELETE]', error)
    return res.status(500).json({ error: 'Could not delete user' })
  }

  return res.json({ success: true })
})

export default router
