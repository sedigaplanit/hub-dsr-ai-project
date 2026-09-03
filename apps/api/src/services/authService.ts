import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto'
import type { AccountRole, LoginRequest } from '../shared/index.js'
import { env } from '../env.js'
import { supabase } from './supabaseClient.js'

type AppUserRow = {
  id: string
  username: string
  password_hash: string
  role: string
}

export interface AuthenticatedAccount {
  id: string
  username: string
  role: AccountRole
}

interface TokenPayload {
  sub: string
  role: AccountRole
  username: string
  exp: number
}

const normalizeUsername = (value: string) => value.trim().toLowerCase()

const encodePayload = (payload: TokenPayload) => Buffer.from(JSON.stringify(payload)).toString('base64url')

const signValue = (value: string) => createHmac('sha256', env.AUTH_TOKEN_SECRET).update(value).digest('base64url')

export const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString('hex')
  const iterations = 120000
  const digest = pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex')
  return `pbkdf2$${iterations}$${salt}$${digest}`
}

export const verifyPassword = (password: string, storedHash: string) => {
  const [scheme, iterationText, salt, digest] = storedHash.split('$')
  if (scheme !== 'pbkdf2' || !iterationText || !salt || !digest) {
    return false
  }

  const derivedDigest = pbkdf2Sync(password, salt, Number(iterationText), 32, 'sha256').toString('hex')
  return timingSafeEqual(Buffer.from(derivedDigest, 'hex'), Buffer.from(digest, 'hex'))
}

export const issueAuthToken = (account: AuthenticatedAccount) => {
  const payload: TokenPayload = {
    sub: account.id,
    role: account.role,
    username: account.username,
    exp: Date.now() + env.AUTH_TOKEN_TTL_HOURS * 60 * 60 * 1000
  }

  const encodedPayload = encodePayload(payload)
  return `${encodedPayload}.${signValue(encodedPayload)}`
}

export const verifyAuthToken = (token: string): AuthenticatedAccount => {
  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature) {
    throw new Error('Invalid token')
  }

  const expectedSignature = signValue(encodedPayload)
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new Error('Invalid token signature')
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as TokenPayload
  if (!payload.sub || !payload.role || !payload.username || !payload.exp) {
    throw new Error('Invalid token payload')
  }

  if (payload.exp < Date.now()) {
    throw new Error('Token expired')
  }

  return {
    id: payload.sub,
    role: payload.role,
    username: payload.username
  }
}

export const ensureBootstrapAdmin = async () => {
  const { data: existingAdmin, error } = await supabase
    .from('app_users')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`Unable to verify bootstrap admin: ${error.message}`)
  }

  if (existingAdmin) {
    return
  }

  const { error: insertError } = await supabase.from('app_users').insert({
    username: normalizeUsername(env.BOOTSTRAP_ADMIN_USERNAME),
    password_hash: hashPassword(env.BOOTSTRAP_ADMIN_PASSWORD),
    role: 'admin',
    created_by: null
  })

  if (insertError && !insertError.message.toLowerCase().includes('duplicate')) {
    throw new Error(`Unable to create bootstrap admin: ${insertError.message}`)
  }
}

export const authenticateAccount = async (payload: LoginRequest) => {
  await ensureBootstrapAdmin()

  const normalizedUsername = normalizeUsername(payload.username)
  const { data: account, error } = await supabase
    .from('app_users')
    .select('id, username, password_hash, role')
    .eq('username', normalizedUsername)
    .eq('role', payload.role)
    .maybeSingle<AppUserRow>()

  if (error) {
    throw new Error(`Unable to authenticate account: ${error.message}`)
  }

  if (!account || !verifyPassword(payload.password, account.password_hash)) {
    throw new Error('Invalid credentials')
  }

  const authenticatedAccount: AuthenticatedAccount = {
    id: account.id,
    username: account.username,
    role: account.role as AccountRole
  }

  return {
    token: issueAuthToken(authenticatedAccount),
    account: authenticatedAccount
  }
}

export const normalizeAccountUsername = normalizeUsername
