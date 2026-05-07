// server/routes/admin/stories.js
// GET    /api/admin/stories        — all stories with filters
// PATCH  /api/admin/stories/:id    — toggle visibility
// DELETE /api/admin/stories/:id    — delete story (super_admin only)

import { Router } from 'express'
import { getSupabase } from '../../lib/supabase.js'
import { requireAdmin } from '../../middleware/adminAuth.js'

const router = Router()

router.get('/', requireAdmin('content_manager'), async (req, res) => {
  const supabase = getSupabase()
  const page    = Math.max(0, parseInt(req.query.page ?? '0'))
  const limit   = 20
  const wave    = req.query.wave?.toString().trim()
  const visible = req.query.visible

  let query = supabase
    .from('stories')
    .select('id, first_name, country, wave_tag, caption, is_visible, created_at')
    .order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)

  if (wave)                      query = query.eq('wave_tag', wave)
  if (visible === 'true')        query = query.eq('is_visible', true)
  else if (visible === 'false')  query = query.eq('is_visible', false)

  const { data, error } = await query

  if (error) {
    console.error('[admin/stories GET]', error)
    return res.status(500).json({ error: 'Could not load stories' })
  }

  return res.json({ stories: data ?? [] })
})

router.patch('/:id', requireAdmin('content_manager'), async (req, res) => {
  const supabase = getSupabase()
  const { id } = req.params
  const { is_visible } = req.body

  if (typeof is_visible !== 'boolean') {
    return res.status(422).json({ error: 'is_visible must be a boolean' })
  }

  const { error } = await supabase
    .from('stories')
    .update({ is_visible })
    .eq('id', id)

  if (error) {
    console.error('[admin/stories PATCH]', error)
    return res.status(500).json({ error: 'Could not update story' })
  }

  return res.json({ success: true })
})

router.delete('/:id', requireAdmin('super_admin'), async (req, res) => {
  const supabase = getSupabase()
  const { id } = req.params

  const { error } = await supabase.from('stories').delete().eq('id', id)

  if (error) {
    console.error('[admin/stories DELETE]', error)
    return res.status(500).json({ error: 'Could not delete story' })
  }

  return res.json({ success: true })
})

export default router
