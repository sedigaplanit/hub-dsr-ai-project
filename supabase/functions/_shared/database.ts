import { createClient } from 'jsr:@supabase/supabase-js@2'
import type { Database } from '../../../apps/api/src/types/supabase.ts'

export const createServiceRoleClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase credentials')
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  })
}
