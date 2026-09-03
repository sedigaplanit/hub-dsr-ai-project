import dayjs from 'dayjs'
import type { DailyReportPayload, TrainingStatus } from '@shared'

type TrainingLearningType = DailyReportPayload['trainings'][number]['learningType']

export interface TrainingFormRow {
  id: string
  title: string
  learningType: TrainingLearningType
  status: TrainingStatus
  etaDate: string
  targetDate: string
  notes: string
}

export const statusPalette: Array<{ value: TrainingStatus; label: string; color: string }> = [
  { value: 'completed', label: 'Completed', color: '#CCFFCC' },
  { value: 'in_progress', label: 'In Progress', color: '#FFF8CC' },
  { value: 'hold', label: 'On Hold', color: '#FFC080' },
  { value: 'sent_for_review', label: 'Sent for Review', color: '#FFE4B5' }
]

export const createEmptyTrainingRow = (): TrainingFormRow => ({
  id: crypto.randomUUID(),
  title: '',
  learningType: 'course',
  status: 'in_progress' as TrainingStatus,
  etaDate: dayjs().format('YYYY-MM-DD'),
  targetDate: dayjs().add(1, 'day').format('YYYY-MM-DD'),
  notes: ''
})
