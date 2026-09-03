import type { AccountRole, DailyReportPayload } from '@shared'

const API_BASE_URL = (process.env.WEB_API_URL ?? '/api').replace(/\/$/, '')

export interface AuthSession {
  token: string
  account: {
    id: string
    username: string
    role: AccountRole
  }
}

export interface ManagedUserAccount {
  id: string
  username: string
  createdAt: string
  createdBy: string | null
}

export interface AdminUsersResponse {
  todayDate: string
  todayAssigneeId: string | null
  users: ManagedUserAccount[]
}

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
    let parsedMessage: string | undefined

    try {
      parsedMessage = (JSON.parse(message) as { message?: string }).message
    } catch {}

    throw new Error(parsedMessage || message || 'Unable to complete request')
  }
  return response
}

const createHeaders = (token?: string, extraHeaders?: HeadersInit) => {
  const headers = new Headers(extraHeaders)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return headers
}

export async function login(role: AccountRole, username: string, password: string): Promise<AuthSession> {
  const response = await parseResponse(
    await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: createHeaders(undefined, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ role, username, password })
    })
  )

  return response.json()
}

export async function fetchAdminUsers(token: string): Promise<AdminUsersResponse> {
  const response = await parseResponse(
    await fetch(`${API_BASE_URL}/admin/users`, {
      headers: createHeaders(token)
    })
  )

  return response.json()
}

export async function createUserAccount(token: string, username: string, password: string) {
  const response = await parseResponse(
    await fetch(`${API_BASE_URL}/admin/users`, {
      method: 'POST',
      headers: createHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ username, password })
    })
  )

  return response.json()
}

export async function deleteUserAccount(token: string, id: string) {
  const response = await parseResponse(
    await fetch(`${API_BASE_URL}/admin/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: createHeaders(token)
    })
  )

  return response.json()
}

export async function assignTodayDsrOwner(token: string, userId: string) {
  const response = await parseResponse(
    await fetch(`${API_BASE_URL}/admin/dsr-assignment`, {
      method: 'PUT',
      headers: createHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ userId })
    })
  )

  return response.json()
}

export async function submitReport(token: string, payload: DailyReportPayload) {
  const response = await parseResponse(
    await fetch(`${API_BASE_URL}/dsr`, {
      method: 'POST',
      headers: createHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    })
  )
  return response.json()
}

export async function fetchEmployees(token: string): Promise<EmployeeDirectoryEntry[]> {
  const response = await parseResponse(
    await fetch(`${API_BASE_URL}/employees`, {
      headers: createHeaders(token)
    })
  )
  return response.json()
}

export async function fetchReports(token: string, date: string): Promise<ApiDailyReport[]> {
  const response = await parseResponse(
    await fetch(`${API_BASE_URL}/dsr?date=${date}`, {
      headers: createHeaders(token)
    })
  )
  return response.json()
}

export async function downloadMonthlyWorkbook(token: string, month: string) {
  const response = await parseResponse(
    await fetch(`${API_BASE_URL}/export/dsr?date=${encodeURIComponent(`${month}-01`)}`, {
      headers: createHeaders(token)
    })
  )
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `hub-dsr-${month}.xlsx`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
