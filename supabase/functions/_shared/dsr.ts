import {
  CV_STATUSES,
  TRAINING_LEARNING_TYPES,
  TRAINING_STATUS,
  type CertificationProgress,
  type CvStatus,
  type TrainingLearningType,
  type TrainingStatus
} from '../../../packages/shared/src/core.ts'
import type { Database } from '../../../apps/api/src/types/supabase.ts'
import { createServiceRoleClient } from './database.ts'

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/
const monthPattern = /^\d{4}-\d{2}$/

type DailyReportRow = Database['public']['Tables']['daily_reports']['Row']
type EmployeeRow = Database['public']['Tables']['employees']['Row']
type TrainingRow = Database['public']['Tables']['training_tasks']['Row']
type CertificationRow = Database['public']['Tables']['certification_progress']['Row']
type ReportWithEmployee = DailyReportRow & { employee: EmployeeRow }
type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>

export type EmployeeSummary = Pick<
  EmployeeRow,
  'id' | 'full_name' | 'email' | 'pod' | 'location' | 'capability'
>

export interface DailyReportInput {
  employeeId: string
  reportDate: string
  trainings: Array<{
    id?: string
    title: string
    learningType: TrainingLearningType
    status: TrainingStatus
    etaDate: string
    targetDate?: string
    notes?: string
  }>
  certificationProgress: CertificationProgress
  cvStatus: {
    status: CvStatus
    targetDate?: string
  }
  blockers?: string
  notes?: string
}

export interface AggregatedDailyReport {
  report: ReportWithEmployee
  trainings: TrainingRow[]
  certification?: CertificationRow | null
}

const assertString = (value: unknown, field: string, maxLength?: number) => {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`)
  }

  const trimmed = value.trim()
  if (!trimmed.length) {
    throw new Error(`${field} is required`)
  }
  if (maxLength && trimmed.length > maxLength) {
    throw new Error(`${field} must be at most ${maxLength} characters`)
  }

  return trimmed
}

const assertOptionalString = (value: unknown, field: string, maxLength?: number) => {
  if (value == null || value === '') {
    return undefined
  }
  return assertString(value, field, maxLength)
}

const assertIsoDate = (value: unknown, field: string) => {
  const date = assertString(value, field)
  if (!isoDatePattern.test(date)) {
    throw new Error(`${field} must use YYYY-MM-DD format`)
  }
  return date
}

export const assertMonth = (value: unknown) => {
  const month = assertString(value, 'month')
  if (!monthPattern.test(month)) {
    throw new Error('month must use YYYY-MM format')
  }
  return month
}

const assertUuid = (value: unknown, field: string) => {
  const identifier = assertString(value, field)
  if (!uuidPattern.test(identifier)) {
    throw new Error(`${field} must be a valid UUID`)
  }
  return identifier
}

const assertEnumValue = <T extends readonly string[]>(value: unknown, field: string, options: T): T[number] => {
  const candidate = assertString(value, field)
  if (!options.includes(candidate)) {
    throw new Error(`${field} must be one of ${options.join(', ')}`)
  }
  return candidate as T[number]
}

export const validateDailyReportPayload = (payload: unknown): DailyReportInput => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Request body must be a JSON object')
  }

  const body = payload as Record<string, unknown>
  if (!Array.isArray(body.trainings)) {
    throw new Error('trainings must be an array')
  }

  const certificationProgress = body.certificationProgress
  if (!certificationProgress || typeof certificationProgress !== 'object') {
    throw new Error('certificationProgress is required')
  }

  const cvStatus = body.cvStatus
  if (!cvStatus || typeof cvStatus !== 'object') {
    throw new Error('cvStatus is required')
  }

  return {
    employeeId: assertUuid(body.employeeId, 'employeeId'),
    reportDate: assertIsoDate(body.reportDate, 'reportDate'),
    trainings: body.trainings.map((training, index) => {
      if (!training || typeof training !== 'object') {
        throw new Error(`trainings[${index}] must be an object`)
      }

      const task = training as Record<string, unknown>
      return {
        id: task.id == null ? undefined : assertUuid(task.id, `trainings[${index}].id`),
        title: assertString(task.title, `trainings[${index}].title`, 280),
        learningType: assertEnumValue(
          task.learningType,
          `trainings[${index}].learningType`,
          TRAINING_LEARNING_TYPES
        ),
        status: assertEnumValue(task.status, `trainings[${index}].status`, TRAINING_STATUS),
        etaDate: assertIsoDate(task.etaDate, `trainings[${index}].etaDate`),
        targetDate:
          task.targetDate == null || task.targetDate === ''
            ? undefined
            : assertIsoDate(task.targetDate, `trainings[${index}].targetDate`),
        notes: assertOptionalString(task.notes, `trainings[${index}].notes`, 280)
      }
    }),
    certificationProgress: {
      istqbDone: Boolean((certificationProgress as Record<string, unknown>).istqbDone),
      istqbTargetDate:
        (certificationProgress as Record<string, unknown>).istqbTargetDate == null ||
        (certificationProgress as Record<string, unknown>).istqbTargetDate === ''
          ? undefined
          : assertIsoDate(
              (certificationProgress as Record<string, unknown>).istqbTargetDate,
              'certificationProgress.istqbTargetDate'
            ),
      caeDone: Boolean((certificationProgress as Record<string, unknown>).caeDone),
      caeTargetDate:
        (certificationProgress as Record<string, unknown>).caeTargetDate == null ||
        (certificationProgress as Record<string, unknown>).caeTargetDate === ''
          ? undefined
          : assertIsoDate(
              (certificationProgress as Record<string, unknown>).caeTargetDate,
              'certificationProgress.caeTargetDate'
            )
    },
    cvStatus: {
      status: assertEnumValue((cvStatus as Record<string, unknown>).status, 'cvStatus.status', CV_STATUSES),
      targetDate:
        (cvStatus as Record<string, unknown>).targetDate == null ||
        (cvStatus as Record<string, unknown>).targetDate === ''
          ? undefined
          : assertIsoDate((cvStatus as Record<string, unknown>).targetDate, 'cvStatus.targetDate')
    },
    blockers: assertOptionalString(body.blockers, 'blockers', 500),
    notes: assertOptionalString(body.notes, 'notes', 500)
  }
}

const enforceEtaRule = (status: TrainingStatus, etaDate: string, reportDate: string): TrainingStatus => {
  if (etaDate === reportDate && status !== 'completed') {
    return 'completed'
  }
  return status
}

const getNextMonthStart = (month: string) => {
  const [yearText, monthText] = month.split('-')
  const year = Number(yearText)
  const monthIndex = Number(monthText)
  const nextYear = monthIndex === 12 ? year + 1 : year
  const nextMonth = monthIndex === 12 ? 1 : monthIndex + 1
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
}

export const formatWorkbookDate = (date: string) => {
  const value = new Date(`${date}T00:00:00Z`)
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  })
    .format(value)
    .replace(/ /g, '-')
}

export const formatSheetName = (date: string) => {
  const value = new Date(`${date}T00:00:00Z`)
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC'
  }).format(value)
}

export const listEmployees = async (client: ServiceRoleClient) => {
  const { data, error } = await client
    .from('employees')
    .select('id, full_name, email, pod, location, capability')
    .order('full_name', { ascending: true })

  if (error) {
    throw new Error(`Unable to fetch employees: ${error.message}`)
  }

  return (data ?? []) as EmployeeSummary[]
}

export const saveDailyReport = async (
  client: ServiceRoleClient,
  payload: DailyReportInput
) => {
  const normalizedTrainings = payload.trainings.map((task) => ({
    ...task,
    status: enforceEtaRule(task.status, task.etaDate, payload.reportDate)
  }))

  const { data: report, error } = await client
    .from('daily_reports')
    .upsert(
      {
        employee_id: payload.employeeId,
        report_date: payload.reportDate,
        blockers: payload.blockers ?? null,
        notes: payload.notes ?? null,
        cv_status: payload.cvStatus.status,
        cv_target_date: payload.cvStatus.targetDate ?? null
      },
      { onConflict: 'employee_id,report_date' }
    )
    .select('*')
    .single()

  if (error || !report) {
    throw new Error(`Failed to upsert daily report: ${error?.message ?? 'Unknown error'}`)
  }

  await client.from('training_tasks').delete().eq('daily_report_id', report.id)

  if (normalizedTrainings.length) {
    const { error: taskError } = await client.from('training_tasks').insert(
      normalizedTrainings.map((task) => ({
        daily_report_id: report.id,
        title: task.title,
        learning_type: task.learningType,
        status: task.status,
        eta_date: task.etaDate,
        target_date: task.targetDate ?? null,
        notes: task.notes ?? null
      }))
    )

    if (taskError) {
      throw new Error(`Failed to insert training tasks: ${taskError.message}`)
    }
  }

  const { error: certError } = await client.from('certification_progress').upsert(
    {
      daily_report_id: report.id,
      istqb_done: payload.certificationProgress.istqbDone,
      istqb_target_date: payload.certificationProgress.istqbTargetDate ?? null,
      cae_done: payload.certificationProgress.caeDone,
      cae_target_date: payload.certificationProgress.caeTargetDate ?? null
    },
    { onConflict: 'daily_report_id' }
  )

  if (certError) {
    throw new Error(`Failed to upsert certification progress: ${certError.message}`)
  }

  return report
}

const aggregateReports = async (
  client: ServiceRoleClient,
  reports: ReportWithEmployee[]
) => {
  if (!reports.length) {
    return [] as AggregatedDailyReport[]
  }

  const ids = reports.map((report) => report.id)
  const [tasksRes, certRes] = await Promise.all([
    client.from('training_tasks').select('*').in('daily_report_id', ids),
    client.from('certification_progress').select('*').in('daily_report_id', ids)
  ])

  if (tasksRes.error) {
    throw new Error(tasksRes.error.message)
  }
  if (certRes.error) {
    throw new Error(certRes.error.message)
  }

  const taskMap = new Map<string, TrainingRow[]>(ids.map((id) => [id, []]))
  tasksRes.data?.forEach((task) => {
    taskMap.get(task.daily_report_id)?.push(task)
  })

  const certMap = new Map<string, CertificationRow>()
  certRes.data?.forEach((cert) => {
    certMap.set(cert.daily_report_id, cert)
  })

  return reports.map((report) => ({
    report,
    trainings: taskMap.get(report.id) ?? [],
    certification: certMap.get(report.id)
  }))
}

export const getReportsByDate = async (
  client: ServiceRoleClient,
  reportDate: string
) => {
  const date = assertIsoDate(reportDate, 'date')
  const { data, error } = await client
    .from('daily_reports')
    .select('*, employee:employee_id (id, full_name, pod, location, capability, email)')
    .eq('report_date', date)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Unable to fetch reports: ${error.message}`)
  }

  return aggregateReports(client, (data ?? []) as ReportWithEmployee[])
}

export const getReportsByMonth = async (
  client: ServiceRoleClient,
  month: string
) => {
  const normalizedMonth = assertMonth(month)
  const startDate = `${normalizedMonth}-01`
  const nextMonthStart = getNextMonthStart(normalizedMonth)
  const { data, error } = await client
    .from('daily_reports')
    .select('*, employee:employee_id (id, full_name, pod, location, capability, email)')
    .gte('report_date', startDate)
    .lt('report_date', nextMonthStart)
    .order('report_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Unable to fetch monthly reports: ${error.message}`)
  }

  const aggregatedReports = await aggregateReports(client, (data ?? []) as ReportWithEmployee[])
  const groupedReports = new Map<string, AggregatedDailyReport[]>()

  aggregatedReports.forEach((entry) => {
    const bucket = groupedReports.get(entry.report.report_date) ?? []
    bucket.push(entry)
    groupedReports.set(entry.report.report_date, bucket)
  })

  return Array.from(groupedReports.entries()).sort(([left], [right]) => left.localeCompare(right))
}
