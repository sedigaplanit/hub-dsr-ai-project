export const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('CORS_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Disposition'
}

export const handleOptions = () => new Response('ok', { headers: corsHeaders })

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json'
    }
  })

export const binary = (body: BodyInit, filename: string, contentType: string) =>
  new Response(body, {
    status: 200,
    headers: {
      ...corsHeaders,
      'content-type': contentType,
      'content-disposition': `attachment; filename="${filename}"`
    }
  })
