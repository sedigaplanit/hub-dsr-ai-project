import { handleOptions, json } from '../_shared/cors.ts'
import { createServiceRoleClient } from '../_shared/database.ts'
import { listEmployees } from '../_shared/dsr.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleOptions()
  }

  if (req.method !== 'GET') {
    return json({ message: 'Method not allowed' }, 405)
  }

  try {
    const client = createServiceRoleClient()
    const employees = await listEmployees(client)
    return json(employees)
  } catch (error) {
    return json({ message: (error as Error).message }, 500)
  }
})
