import { binary, handleOptions, json } from '../_shared/cors.ts'
import {
  HttpError,
  assignTodayDsrUser,
  authenticateAccount,
  createManagedUser,
  deleteManagedUser,
  listManagedUsers,
  parseAssignDsrOwnerRequest,
  parseCreateUserRequest,
  parseLoginRequest,
  readJsonBody,
  requireAuth,
  requireRole,
  assertUserCanSubmitReport
} from '../_shared/auth.ts'
import { createServiceRoleClient } from '../_shared/database.ts'
import { assertMonth, getReportsByDate, getReportsByMonth, listEmployees, saveDailyReport, validateDailyReportPayload } from '../_shared/dsr.ts'
import { buildMonthlyWorkbook } from '../_shared/exporter.ts'

const getRoutePath = (url: URL) => {
  const marker = '/api'
  const markerIndex = url.pathname.lastIndexOf(marker)
  if (markerIndex >= 0) {
    const routePath = url.pathname.slice(markerIndex + marker.length)
    return routePath || '/'
  }

  return url.pathname || '/'
}

const readMonthParam = (url: URL) => {
  const month = url.searchParams.get('month')
  if (month) {
    return assertMonth(month)
  }

  const date = url.searchParams.get('date')
  if (date) {
    return assertMonth(date.slice(0, 7))
  }

  throw new HttpError(400, 'month query param is required')
}

const respondToError = (error: unknown, fallbackStatus = 500) => {
  if (error instanceof HttpError) {
    return json(
      error.details ? { message: error.message, issues: error.details } : { message: error.message },
      error.status
    )
  }

  return json({ message: (error as Error).message }, fallbackStatus)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleOptions()
  }

  const client = createServiceRoleClient()
  const url = new URL(req.url)
  const routePath = getRoutePath(url)

  try {
    if (req.method === 'GET' && routePath === '/healthz') {
      return json({ ok: true, timestamp: new Date().toISOString() })
    }

    if (req.method === 'POST' && routePath === '/auth/login') {
      const payload = parseLoginRequest(await readJsonBody(req))
      return json(await authenticateAccount(client, payload))
    }

    if (req.method === 'GET' && routePath === '/admin/users') {
      await requireRole(req, 'admin')
      return json(await listManagedUsers(client))
    }

    if (req.method === 'POST' && routePath === '/admin/users') {
      const account = await requireRole(req, 'admin')
      const payload = parseCreateUserRequest(await readJsonBody(req))
      return json(await createManagedUser(client, payload, account.id), 201)
    }

    if (req.method === 'DELETE' && /^\/admin\/users\/[^/]+$/.test(routePath)) {
      await requireRole(req, 'admin')
      const userId = routePath.slice('/admin/users/'.length)
      const deletedUsername = await deleteManagedUser(client, userId)
      return json({ message: `Deleted ${deletedUsername}` })
    }

    if (req.method === 'PUT' && routePath === '/admin/dsr-assignment') {
      await requireRole(req, 'admin')
      const payload = parseAssignDsrOwnerRequest(await readJsonBody(req))
      const assignedUsername = await assignTodayDsrUser(client, payload.userId)
      return json({ message: `${assignedUsername} is assigned to today's DSR.` })
    }

    if (req.method === 'GET' && routePath === '/employees') {
      await requireAuth(req)
      return json(await listEmployees(client))
    }

    if (req.method === 'GET' && routePath === '/dsr') {
      await requireAuth(req)
      const date = url.searchParams.get('date')
      if (!date) {
        throw new HttpError(400, 'date query param is required')
      }

      return json(await getReportsByDate(client, date))
    }

    if (req.method === 'POST' && routePath === '/dsr') {
      const account = await requireRole(req, 'user')
      const payload = validateDailyReportPayload(await readJsonBody(req))
      await assertUserCanSubmitReport(client, account.id, payload.reportDate)
      return json(await saveDailyReport(client, payload), 201)
    }

    if (req.method === 'GET' && routePath === '/export/dsr') {
      await requireAuth(req)
      const month = readMonthParam(url)
      const groupedReports = await getReportsByMonth(client, month)
      if (!groupedReports.length) {
        return json({ message: `No reports found for ${month}` }, 404)
      }

      const { buffer, fileName } = await buildMonthlyWorkbook(client, month, groupedReports)
      return binary(buffer, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    }

    return json({ message: 'Not found' }, 404)
  } catch (error) {
    return respondToError(error)
  }
})
