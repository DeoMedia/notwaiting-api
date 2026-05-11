// server/index.js
// #NotWaiting — Express API Server
// Runs on PORT 3001 alongside the Vite frontend on 5173

import 'dotenv/config'
import express from 'express'
import cors from 'cors'

import manifestoRoutes from './routes/manifesto.js'
import claudeRoutes from './routes/claude.js'
import storiesRoutes from './routes/stories.js'
import actionsRoutes from './routes/actions.js'
import dashboardRoutes from './routes/dashboard.js'
import statsRoutes from './routes/stats.js'
import adminStatsRoutes   from './routes/admin/stats.js'
import adminSignersRoutes from './routes/admin/signers.js'
import adminStoriesRoutes from './routes/admin/stories.js'
import adminUsersRoutes   from './routes/admin/users.js'
import adminExportRoutes  from './routes/admin/export.js'

import { apiLimiter } from './middleware/rateLimiter.js'

const app = express()
const PORT = process.env.PORT ?? 3001

// Trust the first proxy hop so express-rate-limit reads the real client IP
// from X-Forwarded-For when deployed behind Vercel/Railway/etc.
app.set('trust proxy', 1)

// ── CORS ─────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.ADMIN_URL,
  'http://localhost:5177',
  'http://localhost:5200',
  'http://localhost:5173',
  'https://notwaiting-frontend.vercel.app',
  'https://notwaiting.africa',
  'https://admin.notwaiting.africa',
].filter(Boolean)

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true)
      }

      return callback(new Error(`CORS blocked origin: ${origin}`))
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)

// ── Middleware ───────────────────────────────────────────────
app.use(express.json({ limit: '50kb' }))
app.use(apiLimiter)

// ── Routes ──────────────────────────────────────────────────
app.use('/api/manifesto', manifestoRoutes)
app.use('/api/claude', claudeRoutes)
app.use('/api/stories', storiesRoutes)
app.use('/api/actions', actionsRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/stats', statsRoutes)
app.use('/api/admin/stats',   adminStatsRoutes)
app.use('/api/admin/signers', adminSignersRoutes)
app.use('/api/admin/stories', adminStoriesRoutes)
app.use('/api/admin/users',   adminUsersRoutes)
app.use('/api/admin/export',  adminExportRoutes)

// ── Health Check ─────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  })
})
app.get('/api/test-stats-route', (_req, res) => {
  res.json({ ok: true })
})
// ── 404 Handler ──────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    error: 'Not found',
  })
})

// ── Global Error Handler ─────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[server] Unhandled error:', err)

  res.status(500).json({
    error: 'Internal server error',
  })
})

// ── Start Server ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ #NotWaiting API running on http://localhost:${PORT}`)
  console.log(`   Health check: http://localhost:${PORT}/api/health\n`)

  if (!process.env.SUPABASE_URL) {
    console.warn('⚠️ SUPABASE_URL not set')
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY not set')
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      '⚠️ ANTHROPIC_API_KEY not set — /api/claude will fail'
    )
  }
})