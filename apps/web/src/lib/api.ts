import type { DailyReportPayload } from '@shared'

const API_BASE_URL = (process.env.WEB_API_URL ?? 'http://localhost:4000/api').replace(/\/$/, '')

export interface EmployeeDirectoryEntry {
  id: string
  full_name: string
  email: string
  pod: string | null
  location: string | null
  capability: string | null
}

export interface ApiDailyReport {
  report: {
    id: string
    employee_id: string
    report_date: string
    blockers: string | null
    notes: string | null
    cv_status: string
    cv_target_date: string | null
    employee: {
      id: string
      full_name: string
      pod: string | null
      location: string | null
    }
  }
  trainings: Array<{
    id: string
    title: string
    learning_type: string
    status: string
    eta_date: string
    target_date: string | null
    notes: string | null
  }>
  certification?: {
    istqb_done: boolean
    istqb_target_date: string | null
    cae_done: boolean
    cae_target_date: string | null
  }
}

const parseResponse = async (response: Response) => {
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Unable to complete request')
  }
  return response
}

export async function submitReport(payload: DailyReportPayload) {
  const response = await parseResponse(
    await fetch(`${API_BASE_URL}/dsr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  )
  return response.json()
}

export async function fetchEmployees(): Promise<EmployeeDirectoryEntry[]> {
  const response = await parseResponse(await fetch(`${API_BASE_URL}/employees`))
  return response.json()
}

export async function fetchReports(date: string): Promise<ApiDailyReport[]> {
  const response = await parseResponse(await fetch(`${API_BASE_URL}/dsr?date=${date}`))
  return response.json()
}

export async function downloadWorkbook(date: string) {
  const response = await parseResponse(await fetch(`${API_BASE_URL}/export/dsr?date=${date}`))
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `hub-dsr-${date}.xlsx`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
