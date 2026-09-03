import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import { env } from './env.js'
import { dsrRouter } from './routes/dsr.js'
import type { Request, Response, NextFunction } from 'express'

const app = express()

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(morgan('dev'))

app.get('/healthz', (_, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() })
})

app.use('/api', dsrRouter)

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ message: error.message })
})

app.listen(env.PORT, () => {
  console.log(`API listening on port ${env.PORT}`)
})
