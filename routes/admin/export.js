// server/routes/admin/export.js
// GET /api/admin/export/signers — CSV download (super_admin only)

import { Router } from 'express'
import { getSupabase } from '../../lib/supabase.js'
import { requireAdmin } from '../../middleware/adminAuth.js'

const router = Router()

router.get('/signers', requireAdmin('super_admin'), async (req, res) => {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('signers')
    .select('first_name, country, wave, wave_tag, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[admin/export]', error)
    return res.status(500).json({ error: 'Export failed' })
  }

  const rows = data ?? []

  const header = ['First Name', 'Country', 'Wave (text)', 'Wave Tag', 'Signed At']
  const csv = [
    header.join(','),
    ...rows.map(r => [
      `"${(r.first_name ?? '').replace(/"/g, '""')}"`,
      `"${(r.country ?? '').replace(/"/g, '""')}"`,
      `"${(r.wave ?? '').replace(/"/g, '""')}"`,
      `"${(r.wave_tag ?? '').replace(/"/g, '""')}"`,
      `"${new Date(r.created_at).toISOString()}"`,
    ].join(','))
  ].join('\n')

  const filename = `notwaiting-signers-${new Date().toISOString().split('T')[0]}.csv`

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  return res.send(csv)
})

export default router
