import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../../lib/supabase.js', () => {
  const client = { from: vi.fn() }
  return { getSupabase: vi.fn(() => client) }
})

vi.mock('../../middleware/adminAuth.js', () => ({
  requireAdmin: (role) => (req, _res, next) => {
    req.adminUser = { id: 'admin-id', email: 'a@b.com', role }
    next()
  },
}))

import adminExportRoutes from '../../routes/admin/export.js'
import { getSupabase } from '../../lib/supabase.js'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/admin/export', adminExportRoutes)
  return app
}

// Mock a paginated chain: first call returns `data`, subsequent calls return []
function mockPaginatedExport(client, data) {
  client.from
    .mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          range: vi.fn().mockResolvedValue({ data, error: null }),
        }),
      }),
    })
    // Second page call returns empty array → stops the loop
    .mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          range: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    })
}

describe('GET /api/admin/export/signers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns CSV with correct column headers', async () => {
    const client = getSupabase()
    mockPaginatedExport(client, [])

    const res = await request(makeApp()).get('/api/admin/export/signers')

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/csv/)
    expect(res.headers['content-disposition']).toMatch(/attachment/)
    expect(res.text).toContain('First Name,Country,Wave (text),Wave Tag,Signed At')
  })

  it('returns correct signer data in CSV rows', async () => {
    const client = getSupabase()
    mockPaginatedExport(client, [
      { first_name: 'Amara', country: 'ghana', wave: 'I build in health', wave_tag: 'health', created_at: '2026-01-15T10:00:00Z' },
    ])

    const res = await request(makeApp()).get('/api/admin/export/signers')

    expect(res.text).toContain('"Amara"')
    expect(res.text).toContain('"ghana"')
    expect(res.text).toContain('"health"')
  })

  it('escapes double quotes in field values (CSV injection defence)', async () => {
    const client = getSupabase()
    mockPaginatedExport(client, [
      { first_name: 'Quote"Test', country: 'nigeria', wave: '', wave_tag: '', created_at: '2026-01-01T00:00:00Z' },
    ])

    const res = await request(makeApp()).get('/api/admin/export/signers')

    expect(res.text).toContain('"Quote""Test"')
  })

  it('returns header-only CSV when there are no signers', async () => {
    const client = getSupabase()
    mockPaginatedExport(client, [])

    const res = await request(makeApp()).get('/api/admin/export/signers')

    expect(res.status).toBe(200)
    const lines = res.text.trim().split('\n')
    expect(lines).toHaveLength(1) // header only
  })

  it('handles null field values without crashing', async () => {
    const client = getSupabase()
    mockPaginatedExport(client, [
      { first_name: null, country: null, wave: null, wave_tag: null, created_at: '2026-01-01T00:00:00Z' },
    ])

    const res = await request(makeApp()).get('/api/admin/export/signers')

    expect(res.status).toBe(200)
    expect(res.text).toContain('""')
  })

  it('filename includes current date', async () => {
    const client = getSupabase()
    mockPaginatedExport(client, [])

    const res = await request(makeApp()).get('/api/admin/export/signers')

    const today = new Date().toISOString().split('T')[0]
    expect(res.headers['content-disposition']).toContain(today)
  })

  it('streams multiple pages — stops when a page has fewer than PAGE_SIZE rows', async () => {
    const client = getSupabase()
    const rangeMock = vi.fn()
      // Page 0: full page (1000 rows) → continue
      .mockResolvedValueOnce({ data: Array(1000).fill({ first_name: 'A', country: 'ng', wave: '', wave_tag: 'tech', created_at: '2026-01-01T00:00:00Z' }), error: null })
      // Page 1: partial page (1 row) → loop stops here, no third fetch
      .mockResolvedValueOnce({ data: [{ first_name: 'B', country: 'gh', wave: '', wave_tag: 'tech', created_at: '2026-01-01T00:00:00Z' }], error: null })

    client.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({ range: rangeMock }),
      }),
    })

    const res = await request(makeApp()).get('/api/admin/export/signers')

    // Two fetches: one full page then one partial page (which ends the loop)
    expect(rangeMock).toHaveBeenCalledTimes(2)
    // 1 header + 1000 + 1 data rows = 1002 lines
    const lines = res.text.trim().split('\n')
    expect(lines).toHaveLength(1002)
  })

  it('writes EXPORT_ERROR sentinel when a page fetch fails mid-stream', async () => {
    const client = getSupabase()
    client.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          range: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB down' } }),
        }),
      }),
    })

    const res = await request(makeApp()).get('/api/admin/export/signers')

    // Headers were already sent (200 + CSV content-type), body contains error sentinel
    expect(res.status).toBe(200)
    expect(res.text).toContain('EXPORT_ERROR')
  })
})
