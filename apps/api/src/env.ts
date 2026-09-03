import 'dotenv/config'
import { z } from 'zod'

const EnvSchema = z.object({
  PORT: z.coerce.number().default(4000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  AUTH_TOKEN_SECRET: z.string().default('development-auth-secret-change-me'),
  AUTH_TOKEN_TTL_HOURS: z.coerce.number().default(12),
  BOOTSTRAP_ADMIN_USERNAME: z.string().default('admin'),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().default('admin123'),
  DSR_TEMPLATE_PATH: z
    .string()
    .default('resources/templates/Hub_DSR_Template.xlsx')
})

export const env = EnvSchema.parse(process.env)
