import { Router } from 'express'
import { LoginRequestSchema } from '../shared/index.js'
import { authenticateAccount } from '../services/authService.js'

const router = Router()

router.post('/login', async (req, res) => {
  const parsed = LoginRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload', issues: parsed.error.issues })
  }

  try {
    const session = await authenticateAccount(parsed.data)
    res.json(session)
  } catch (error) {
    res.status(401).json({ message: (error as Error).message })
  }
})

export const authRouter = router
