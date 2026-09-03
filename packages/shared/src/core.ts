export const TRAINING_STATUS = ['completed', 'hold', 'in_progress', 'sent_for_review'] as const

export type TrainingStatus = (typeof TRAINING_STATUS)[number]

export const TRAINING_LEARNING_TYPES = ['course', 'shadowing', 'certification', 'internal'] as const

export type TrainingLearningType = (typeof TRAINING_LEARNING_TYPES)[number]

export const STATUS_COLOR_HEX: Record<TrainingStatus, string> = {
  completed: '#CCFFCC',
  hold: '#FFC080',
  in_progress: '#FFF8CC',
  sent_for_review: '#FFE4B5'
}

export const CV_STATUSES = ['done', 'sent_for_review', 'not_started'] as const

export type CvStatus = (typeof CV_STATUSES)[number]

export interface CertificationProgress {
  istqbDone: boolean
  istqbTargetDate?: string
  caeDone: boolean
  caeTargetDate?: string
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

export function deriveCertificationHeadline(progress: CertificationProgress): string {
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
