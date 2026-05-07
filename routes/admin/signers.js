// server/routes/admin/signers.js
// GET    /api/admin/signers        — list with search/filter/pagination
// DELETE /api/admin/signers/:id    — delete a signer (super_admin only)

import { Router } from 'express'
import { getSupabase } from '../../lib/supabase.js'
import { requireAdmin } from '../../middleware/adminAuth.js'

const router = Router()

router.get('/', requireAdmin('content_manager'), async (req, res) => {
  const supabase = getSupabase()
  const page    = Math.max(0, parseInt(req.query.page ?? '0'))
  const limit   = 20
  const search  = req.query.search?.toString().trim()
  const country = req.query.country?.toString().trim()
  const wave    = req.query.wave?.toString().trim()

  let query = supabase
    .from('signers')
    .select('id, first_name, country, wave_tag, wave, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)

  if (search)  query = query.ilike('first_name', `%${search}%`)
  if (country) query = query.eq('country', country)
  if (wave)    query = query.eq('wave_tag', wave)

  const { data, error, count } = await query

  if (error) {
    console.error('[admin/signers GET]', error)
    return res.status(500).json({ error: 'Could not load signers' })
  }

  return res.json({ signers: data ?? [], total: count ?? 0 })
})

router.delete('/:id', requireAdmin('super_admin'), async (req, res) => {
  const supabase = getSupabase()
  const { id } = req.params

  const { error } = await supabase.from('signers').delete().eq('id', id)

  if (error) {
    console.error('[admin/signers DELETE]', error)
    return res.status(500).json({ error: 'Could not delete signer' })
  }

  return res.json({ success: true })
})

export default router
