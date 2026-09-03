import { z } from 'zod'

export const ACCOUNT_ROLES = ['admin', 'user'] as const

export const LoginRequestSchema = z.object({
  role: z.enum(ACCOUNT_ROLES),
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required')
})

export const CreateUserRequestSchema = z.object({
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required')
})

export const AssignDsrOwnerRequestSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID')
})

export type AccountRole = (typeof ACCOUNT_ROLES)[number]
export type LoginRequest = z.infer<typeof LoginRequestSchema>
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>
export type AssignDsrOwnerRequest = z.infer<typeof AssignDsrOwnerRequestSchema>
