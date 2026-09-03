import { createClient } from 'jsr:@supabase/supabase-js@2'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json' }
  })

const computeCutoff = () => {
  const date = new Date()
  date.setDate(date.getDate() - 7)
  return date.toISOString().split('T')[0]
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const preview = url.searchParams.get('preview') === 'true'
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Missing Supabase credentials' }, 500)
  }

  const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const cutoff = computeCutoff()

  if (preview) {
    const { count, error } = await client
      .from('daily_reports')
      .select('*', { count: 'exact', head: true })
      .lt('report_date', cutoff)

    if (error) return json({ error: error.message }, 500)
    return json({ mode: 'preview', cutoff, totalReportsPendingDeletion: count ?? 0 })
  }

  const { error, count } = await client
    .from('daily_reports')
    .delete({ count: 'exact' })
    .lt('report_date', cutoff)

  if (error) return json({ error: error.message }, 500)

  return json({ cutoff, deletedReports: count ?? 0 })
})
