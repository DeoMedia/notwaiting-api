// server/routes/admin/signers.js
// GET    /api/admin/signers      — list with search/filter/pagination
// DELETE /api/admin/signers/:id  — delete a signer (super_admin only)

import { Router } from 'express'
import { requireAdmin } from '../../middleware/adminAuth.js'
import { listSigners, deleteSigner } from '../../services/signers.js'

const router = Router()

router.get('/', requireAdmin('content_manager'), async (req, res) => {
  const page    = Math.max(0, parseInt(req.query.page ?? '0'))
  const search  = req.query.search?.toString().trim()
  const country = req.query.country?.toString().trim()
  const wave    = req.query.wave?.toString().trim()

  const { data, error, count } = await listSigners({ page, search, country, wave })

  if (error) {
    console.error('[admin/signers GET]', error)
    return res.status(500).json({ error: 'Could not load signers' })
  }

  return res.json({ signers: data ?? [], total: count ?? 0 })
})

router.delete('/:id', requireAdmin('super_admin'), async (req, res) => {
  const { error } = await deleteSigner(req.params.id)

  if (error) {
    console.error('[admin/signers DELETE]', error)
    return res.status(500).json({ error: 'Could not delete signer' })
  }

  return res.json({ success: true })
})

export default router
