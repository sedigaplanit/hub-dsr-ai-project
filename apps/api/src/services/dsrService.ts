import dayjs from 'dayjs'
import { DailyReportSchema, type DailyReportPayload, type TrainingStatus } from '../shared/index.js'
import { supabase } from './supabaseClient.js'
import type { Database } from '../types/supabase.js'

type DailyReportRow = Database['public']['Tables']['daily_reports']['Row']
type EmployeeRow = Database['public']['Tables']['employees']['Row']
type TrainingRow = Database['public']['Tables']['training_tasks']['Row']
type CertificationRow = Database['public']['Tables']['certification_progress']['Row']
type ReportWithEmployee = DailyReportRow & { employee: EmployeeRow }

export type EmployeeSummary = Pick<
  EmployeeRow,
  'id' | 'full_name' | 'email' | 'pod' | 'location' | 'capability'
>

export interface AggregatedDailyReport {
  report: DailyReportRow & { employee: EmployeeRow }
  trainings: TrainingRow[]
  certification?: CertificationRow | null
}

const enforceEtaRule = (status: TrainingStatus, eta: string): TrainingStatus => {
  const dueToday = dayjs(eta).isSame(dayjs(), 'day')
  if (dueToday && status !== 'completed') {
    return 'completed'
  }
  return status
}

export async function saveDailyReport(payload: DailyReportPayload) {
  const parsed = DailyReportSchema.parse(payload)
  const normalizedTrainings = parsed.trainings.map((task) => ({
    ...task,
    status: enforceEtaRule(task.status, task.etaDate)
  }))

  const { data: report, error } = await supabase
    .from('daily_reports')
    .upsert(
      {
        employee_id: parsed.employeeId,
        report_date: parsed.reportDate,
        blockers: parsed.blockers ?? null,
        notes: parsed.notes ?? null,
        cv_status: parsed.cvStatus.status,
        cv_target_date: parsed.cvStatus.targetDate ?? null
      },
      {
        onConflict: 'employee_id,report_date'
      }
    )
    .select('*')
    .single()

  if (error || !report) {
    throw new Error(`Failed to upsert daily report: ${error?.message}`)
  }

  await supabase.from('training_tasks').delete().eq('daily_report_id', report.id)

  if (normalizedTrainings.length) {
    const insertPayload = normalizedTrainings.map((task) => ({
      daily_report_id: report.id,
      title: task.title,
      learning_type: task.learningType,
      status: task.status,
      eta_date: task.etaDate,
      target_date: task.targetDate ?? null,
      notes: task.notes ?? null
    }))
    const { error: taskError } = await supabase.from('training_tasks').insert(insertPayload)
    if (taskError) {
      throw new Error(`Failed to insert training tasks: ${taskError.message}`)
    }
  }

  const { error: certError } = await supabase
    .from('certification_progress')
    .upsert(
      {
        daily_report_id: report.id,
        istqb_done: parsed.certificationProgress.istqbDone,
        istqb_target_date: parsed.certificationProgress.istqbTargetDate ?? null,
        cae_done: parsed.certificationProgress.caeDone,
        cae_target_date: parsed.certificationProgress.caeTargetDate ?? null
      },
      { onConflict: 'daily_report_id' }
    )

  if (certError) {
    throw new Error(`Failed to upsert certification progress: ${certError.message}`)
  }

  return report
}

export async function listEmployees(): Promise<EmployeeSummary[]> {
  const { data, error } = await supabase
    .from('employees')
    .select('id, full_name, email, pod, location, capability')
    .order('full_name', { ascending: true })

  if (error) {
    throw new Error(`Unable to fetch employees: ${error.message}`)
  }

  return data ?? []
}

export async function getReportsByDate(reportDate: string): Promise<AggregatedDailyReport[]> {
  const { data: reports, error } = await supabase
    .from('daily_reports')
    .select('*, employee:employee_id (id, full_name, pod, location, capability, email)')
    .eq('report_date', reportDate)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Unable to fetch reports: ${error.message}`)
  }

  if (!reports?.length) {
    return []
  }

  const typedReports = (reports ?? []) as ReportWithEmployee[]
  const ids = typedReports.map((report) => report.id)

  const [tasksRes, certRes] = await Promise.all([
    supabase
      .from('training_tasks')
      .select('*')
      .in('daily_report_id', ids),
    supabase
      .from('certification_progress')
      .select('*')
      .in('daily_report_id', ids)
  ])

  if (tasksRes.error) throw new Error(tasksRes.error.message)
  if (certRes.error) throw new Error(certRes.error.message)

  const taskMap = new Map<string, TrainingRow[]>(ids.map((id) => [id, []]))
  tasksRes.data?.forEach((task) => {
    taskMap.get(task.daily_report_id)?.push(task)
  })

  const certMap = new Map<string, CertificationRow>()
  certRes.data?.forEach((cert) => {
    certMap.set(cert.daily_report_id, cert)
  })

  return typedReports.map((report) => ({
    report,
    trainings: taskMap.get(report.id) ?? [],
    certification: certMap.get(report.id)
  }))
}
