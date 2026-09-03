import { createClient } from '@supabase/supabase-js'
import { env } from '../env.js'
import type { Database } from '../types/supabase.js'

export const supabase = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
})
