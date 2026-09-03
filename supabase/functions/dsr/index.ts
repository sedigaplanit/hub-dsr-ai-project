import { handleOptions, json } from '../_shared/cors.ts'
import { createServiceRoleClient } from '../_shared/database.ts'
import { getReportsByDate, saveDailyReport, validateDailyReportPayload } from '../_shared/dsr.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleOptions()
  }

  try {
    const client = createServiceRoleClient()

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const date = url.searchParams.get('date')
      if (!date) {
        return json({ message: 'date query param is required' }, 400)
      }

      const reports = await getReportsByDate(client, date)
      return json(reports)
    }

    if (req.method === 'POST') {
      const payload = validateDailyReportPayload(await req.json())
      const report = await saveDailyReport(client, payload)
      return json(report, 201)
    }

    return json({ message: 'Method not allowed' }, 405)
  } catch (error) {
    return json({ message: (error as Error).message }, 500)
  }
})
