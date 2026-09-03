import { binary, handleOptions, json } from '../_shared/cors.ts'
import { createServiceRoleClient } from '../_shared/database.ts'
import { buildMonthlyWorkbook } from '../_shared/exporter.ts'
import { assertMonth, getReportsByMonth } from '../_shared/dsr.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleOptions()
  }

  if (req.method !== 'GET') {
    return json({ message: 'Method not allowed' }, 405)
  }

  try {
    const url = new URL(req.url)
    const month = assertMonth(url.searchParams.get('month'))
    const client = createServiceRoleClient()
    const groupedReports = await getReportsByMonth(client, month)

    if (!groupedReports.length) {
      return json({ message: `No reports found for ${month}` }, 404)
    }

    const { buffer, fileName } = await buildMonthlyWorkbook(client, month, groupedReports)
    return binary(
      buffer,
      fileName,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
  } catch (error) {
    return json({ message: (error as Error).message }, 500)
  }
})
