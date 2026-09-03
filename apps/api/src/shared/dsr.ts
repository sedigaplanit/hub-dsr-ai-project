import { z } from 'zod'

export const TRAINING_STATUS = [
  'completed',
  'hold',
  'in_progress',
  'sent_for_review'
] as const

export const STATUS_COLOR_HEX: Record<(typeof TRAINING_STATUS)[number], string> = {
  completed: '#CCFFCC',
  hold: '#FFC080',
  in_progress: '#FFF8CC',
  sent_for_review: '#FFE4B5'
}

export const CV_STATUSES = ['done', 'sent_for_review', 'not_started'] as const

const isoDate = z
  .string()
  .regex(/\d{4}-\d{2}-\d{2}/, 'Use ISO date format (YYYY-MM-DD)')

export const TrainingTaskSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(3),
  learningType: z.enum(['course', 'shadowing', 'certification', 'internal']),
  status: z.enum(TRAINING_STATUS),
  etaDate: isoDate,
  targetDate: isoDate.optional(),
  notes: z.string().max(280).optional()
})

export const CertificationProgressSchema = z.object({
  istqbDone: z.boolean(),
  istqbTargetDate: isoDate.optional(),
  caeDone: z.boolean(),
  caeTargetDate: isoDate.optional()
})

export const CvStatusSchema = z.object({
  status: z.enum(CV_STATUSES),
  targetDate: isoDate.optional()
})

export const DailyReportSchema = z.object({
  employeeId: z.string().uuid(),
  reportDate: isoDate,
  trainings: z.array(TrainingTaskSchema),
  certificationProgress: CertificationProgressSchema,
  cvStatus: CvStatusSchema,
  blockers: z.string().max(500).optional(),
  notes: z.string().max(500).optional()
})

export type TrainingStatus = (typeof TRAINING_STATUS)[number]
export type DailyReportPayload = z.infer<typeof DailyReportSchema>

export function deriveCertificationHeadline(progress: z.infer<typeof CertificationProgressSchema>): string {
  const { istqbDone, caeDone, caeTargetDate, istqbTargetDate } = progress
  if (istqbDone && caeDone) {
    return 'Done'
  }
  if (istqbDone && !caeDone) {
    return `ISTQB - Done & CAE yet to complete${caeTargetDate ? ` (Target ${caeTargetDate})` : ''}`
  }
  if (!istqbDone && caeDone) {
    return `CAE - Done & ISTQB yet to complete${istqbTargetDate ? ` (Target ${istqbTargetDate})` : ''}`
  }
  return 'In Progress'
}

export const COLUMN_KEYS = {
  employeeName: 1,
  pod: 2,
  location: 3,
  capability: 4,
  taskTitle: 5,
  learningType: 6,
  status: 7,
  eta: 8,
  notes: 9,
  certificationSummary: 10,
  cvStatus: 11,
  blockers: 12
} as const

export type ColumnKey = keyof typeof COLUMN_KEYS
