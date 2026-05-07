// server/middleware/adminAuth.js
// Validates Supabase JWT and checks admin_users table for role.
// Usage: router.get('/', requireAdmin(), handler)
//        router.delete('/:id', requireAdmin('super_admin'), handler)

import { createClient } from '@supabase/supabase-js'

export function requireAdmin(requiredRole = 'content_manager') {
  return async (req, res, next) => {
    const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim()

    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    try {
      // Validate the JWT using the anon key (validates user tokens)
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )

      const { data: { user }, error: authError } = await supabase.auth.getUser(token)

      if (authError || !user) {
        return res.status(401).json({ error: 'Invalid or expired token' })
      }

      // Check role in admin_users using service role (bypasses RLS)
      const { createClient: createServiceClient } = await import('@supabase/supabase-js')
      const serviceClient = createServiceClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )

      const { data: adminUser, error: roleError } = await serviceClient
        .from('admin_users')
        .select('role')
        .eq('user_id', user.id)
        .single()

      if (roleError || !adminUser) {
        return res.status(403).json({ error: 'No admin access' })
      }

      const role = adminUser.role

      if (requiredRole === 'super_admin' && role !== 'super_admin') {
        return res.status(403).json({ error: 'Super admin access required' })
      }

      // Attach user and role to request for use in handlers
      req.adminUser = { id: user.id, email: user.email, role }
      next()
    } catch (err) {
      console.error('[adminAuth] Error:', err)
      return res.status(500).json({ error: 'Auth check failed' })
    }
  }
}
