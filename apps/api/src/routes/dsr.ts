import { Router } from 'express'
import { z } from 'zod'
import { DailyReportSchema } from '../shared/index.js'
import { requireAuth, requireUser } from '../middleware/auth.js'
import { assertUserCanSubmitReport } from '../services/accountService.js'
import { saveDailyReport, getReportsByDate, listEmployees } from '../services/dsrService.js'
import { buildWorkbookBuffer } from '../services/exporter.js'

const router = Router()

const DateQuerySchema = z.object({
  date: z
    .string()
    .regex(/\d{4}-\d{2}-\d{2}/, 'date query param must be YYYY-MM-DD')
})

router.get('/employees', requireAuth, async (_req, res) => {
  try {
    const employees = await listEmployees()
    res.json(employees)
  } catch (error) {
    res.status(500).json({ message: (error as Error).message })
  }
})

router.post('/dsr', requireUser, async (req, res) => {
  const parsed = DailyReportSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload', issues: parsed.error.issues })
  }

  try {
    await assertUserCanSubmitReport(req.auth!.id, parsed.data.reportDate)
    const report = await saveDailyReport(parsed.data)
    res.status(201).json(report)
  } catch (error) {
    res.status(400).json({ message: (error as Error).message })
  }
})

router.get('/dsr', requireAuth, async (req, res) => {
  const parsed = DateQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid query', issues: parsed.error.issues })
  }

  try {
    const reports = await getReportsByDate(parsed.data.date)
    res.json(reports)
  } catch (error) {
    res.status(500).json({ message: (error as Error).message })
  }
})

router.get('/export/dsr', requireAuth, async (req, res) => {
  const parsed = DateQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid query', issues: parsed.error.issues })
  }

  try {
    const reports = await getReportsByDate(parsed.data.date)
    const buffer = await buildWorkbookBuffer(parsed.data.date, reports)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="hub-dsr-${parsed.data.date}.xlsx"`)
    res.send(Buffer.from(buffer))
  } catch (error) {
    res.status(500).json({ message: (error as Error).message })
  }
})

export const dsrRouter = router
