// server/routes/admin/export.js
// GET /api/admin/export/signers — CSV download (super_admin only)
//
// Streams rows in pages of PAGE_SIZE to avoid loading 100k+ rows into memory
// at once. Headers are written first so the download starts immediately.

import { Router } from 'express'
import { getSupabase } from '../../lib/supabase.js'
import { requireAdmin } from '../../middleware/adminAuth.js'

const router = Router()

const PAGE_SIZE = 1000

const CSV_HEADER = ['First Name', 'Country', 'Wave (text)', 'Wave Tag', 'Signed At']

function toCSVRow(r) {
  return [
    `"${(r.first_name ?? '').replace(/"/g, '""')}"`,
    `"${(r.country    ?? '').replace(/"/g, '""')}"`,
    `"${(r.wave       ?? '').replace(/"/g, '""')}"`,
    `"${(r.wave_tag   ?? '').replace(/"/g, '""')}"`,
    `"${new Date(r.created_at).toISOString()}"`,
  ].join(',')
}

router.get('/signers', requireAdmin('super_admin'), async (req, res) => {
  const supabase  = getSupabase()
  const filename  = `notwaiting-signers-${new Date().toISOString().split('T')[0]}.csv`

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

  res.write(CSV_HEADER.join(',') + '\n')

  let page = 0

  while (true) {
    const { data, error } = await supabase
      .from('signers')
      .select('first_name, country, wave, wave_tag, created_at')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (error) {
      console.error('[admin/export] page', page, error)
      // Headers already sent — write a sentinel so downstream knows the export is incomplete
      res.write('# EXPORT_ERROR: database error on page ' + page + '\n')
      break
    }

    if (!data || data.length === 0) break

    for (const r of data) {
      res.write(toCSVRow(r) + '\n')
    }

    if (data.length < PAGE_SIZE) break
    page++
  }

  res.end()
})

export default router
