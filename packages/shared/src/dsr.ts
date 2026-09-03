import { z } from 'zod'
import {
  COLUMN_KEYS,
  CV_STATUSES,
  deriveCertificationHeadline,
  STATUS_COLOR_HEX,
  TRAINING_LEARNING_TYPES,
  TRAINING_STATUS,
  type CertificationProgress,
  type ColumnKey,
  type CvStatus,
  type TrainingLearningType,
  type TrainingStatus
} from './core'

const isoDate = z.string().regex(/\d{4}-\d{2}-\d{2}/, 'Use ISO date format (YYYY-MM-DD)')

export const TrainingTaskSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(3),
  learningType: z.enum(TRAINING_LEARNING_TYPES),
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

export type DailyReportPayload = z.infer<typeof DailyReportSchema>

export {
  COLUMN_KEYS,
  CV_STATUSES,
  deriveCertificationHeadline,
  STATUS_COLOR_HEX,
  TRAINING_LEARNING_TYPES,
  TRAINING_STATUS
}

export type { CertificationProgress, ColumnKey, CvStatus, TrainingLearningType, TrainingStatus }
