// server/routes/admin/stories.js
// GET    /api/admin/stories      — all stories with filters
// PATCH  /api/admin/stories/:id  — toggle visibility
// DELETE /api/admin/stories/:id  — delete story (super_admin only)

import { Router } from 'express'
import { requireAdmin } from '../../middleware/adminAuth.js'
import { listAllStories, setStoryVisibility, deleteStory } from '../../services/stories.js'

const router = Router()

router.get('/', requireAdmin('content_manager'), async (req, res) => {
  const page = Math.max(0, parseInt(req.query.page ?? '0'))
  const wave = req.query.wave?.toString().trim()
  const visible = req.query.visible === 'true' ? true
    : req.query.visible === 'false' ? false
    : undefined

  const { data, error } = await listAllStories({ page, wave, visible })

  if (error) {
    console.error('[admin/stories GET]', error)
    return res.status(500).json({ error: 'Could not load stories' })
  }

  return res.json({ stories: data ?? [] })
})

router.patch('/:id', requireAdmin('content_manager'), async (req, res) => {
  const { is_visible } = req.body
  if (typeof is_visible !== 'boolean') {
    return res.status(422).json({ error: 'is_visible must be a boolean' })
  }

  const { error } = await setStoryVisibility(req.params.id, is_visible)
  if (error) {
    console.error('[admin/stories PATCH]', error)
    return res.status(500).json({ error: 'Could not update story' })
  }

  return res.json({ success: true })
})

router.delete('/:id', requireAdmin('super_admin'), async (req, res) => {
  const { error } = await deleteStory(req.params.id)
  if (error) {
    console.error('[admin/stories DELETE]', error)
    return res.status(500).json({ error: 'Could not delete story' })
  }

  return res.json({ success: true })
})

export default router
