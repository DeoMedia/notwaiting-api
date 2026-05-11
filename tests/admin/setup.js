// Shared admin test helpers
import { vi } from 'vitest'
import express from 'express'

// Returns a mock req with an attached adminUser
export function mockAdminReq(role = 'content_manager') {
  return { adminUser: { id: 'admin-user-id', email: 'admin@test.com', role } }
}

// Builds an Express app with admin-like middleware that injects a fake adminUser
// This bypasses requireAdmin JWT validation for route logic tests.
export function makeAdminApp(routes, role = 'content_manager') {
  const app = express()
  app.use(express.json())

  // Inject admin user without real JWT
  app.use((req, _res, next) => {
    req.adminUser = { id: 'admin-user-id', email: 'admin@test.com', role }
    next()
  })

  app.use('/api/admin', routes)
  return app
}
