import { Router } from 'express'
import { z } from 'zod'
import { AssignDsrOwnerRequestSchema, CreateUserRequestSchema } from '../shared/index.js'
import { requireAdmin } from '../middleware/auth.js'
import { assignTodayDsrUser, createManagedUser, deleteManagedUser, listManagedUsers } from '../services/accountService.js'

const router = Router()
const ParamsSchema = z.object({ id: z.string().uuid('id must be a valid UUID') })

router.use(requireAdmin)

router.get('/users', async (_req, res) => {
  try {
    const data = await listManagedUsers()
    res.json(data)
  } catch (error) {
    res.status(500).json({ message: (error as Error).message })
  }
})

router.post('/users', async (req, res) => {
  const parsed = CreateUserRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload', issues: parsed.error.issues })
  }

  try {
    const createdUser = await createManagedUser(parsed.data, req.auth!.id)
    res.status(201).json(createdUser)
  } catch (error) {
    res.status(400).json({ message: (error as Error).message })
  }
})

router.delete('/users/:id', async (req, res) => {
  const parsed = ParamsSchema.safeParse(req.params)
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid params', issues: parsed.error.issues })
  }

  try {
    const deletedUsername = await deleteManagedUser(parsed.data.id)
    res.json({ message: `Deleted ${deletedUsername}` })
  } catch (error) {
    res.status(400).json({ message: (error as Error).message })
  }
})

router.put('/dsr-assignment', async (req, res) => {
  const parsed = AssignDsrOwnerRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload', issues: parsed.error.issues })
  }

  try {
    const assignedUsername = await assignTodayDsrUser(parsed.data.userId)
    res.json({ message: `${assignedUsername} is assigned to today's DSR.` })
  } catch (error) {
    res.status(400).json({ message: (error as Error).message })
  }
})

export const adminRouter = router
