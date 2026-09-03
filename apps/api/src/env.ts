import 'dotenv/config'
import { z } from 'zod'

const EnvSchema = z.object({
  PORT: z.coerce.number().default(4000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  DSR_TEMPLATE_PATH: z
    .string()
    .default('resources/templates/Hub_DSR_Template.xlsx')
})

export const env = EnvSchema.parse(process.env)
