import type { Database } from '../../../apps/api/src/types/supabase.ts'
import { createServiceRoleClient } from './database.ts'

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>
type AppUserRow = Database['public']['Tables']['app_users']['Row']

export type AccountRole = 'admin' | 'user'

export interface AuthenticatedAccount {
  id: string
  username: string
  role: AccountRole
}

export class HttpError extends Error {
  status: number
  details?: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.details = details
  }
}

interface TokenPayload {
  sub: string
  role: AccountRole
  username: string
  exp: number
}

const ACCOUNT_ROLES: AccountRole[] = ['admin', 'user']
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
let hmacKeyPromise: Promise<CryptoKey> | undefined

const currentDate = () => new Date().toISOString().slice(0, 10)

const getAuthTokenSecret = () => Deno.env.get('AUTH_TOKEN_SECRET') || 'development-auth-secret-change-me'

const getAuthTokenTtlHours = () => {
  const value = Number(Deno.env.get('AUTH_TOKEN_TTL_HOURS') ?? '12')
  return Number.isFinite(value) && value > 0 ? value : 12
}

const getBootstrapAdminUsername = () => Deno.env.get('BOOTSTRAP_ADMIN_USERNAME') ?? 'admin'
const getBootstrapAdminPassword = () => Deno.env.get('BOOTSTRAP_ADMIN_PASSWORD') ?? 'admin123'

const bytesToBase64Url = (bytes: Uint8Array) => {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const base64UrlToBytes = (value: string) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

const hexToBytes = (value: string) => {
  if (value.length % 2 !== 0) {
    throw new Error('Invalid hex string')
  }

  const bytes = new Uint8Array(value.length / 2)
  for (let index = 0; index < value.length; index += 2) {
    const byte = Number.parseInt(value.slice(index, index + 2), 16)
    if (Number.isNaN(byte)) {
      throw new Error('Invalid hex string')
    }
    bytes[index / 2] = byte
  }
  return bytes
}

const constantTimeEqual = (left: Uint8Array, right: Uint8Array) => {
  if (left.length !== right.length) {
    return false
  }

  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left[index] ^ right[index]
  }
  return mismatch === 0
}

const getHmacKey = () => {
  if (!hmacKeyPromise) {
    hmacKeyPromise = crypto.subtle.importKey(
      'raw',
      textEncoder.encode(getAuthTokenSecret()),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
  }

  return hmacKeyPromise
}

const signValue = async (value: string) => {
  const signature = await crypto.subtle.sign('HMAC', await getHmacKey(), textEncoder.encode(value))
  return new Uint8Array(signature)
}

const derivePasswordDigest = async (password: string, salt: string, iterations: number) => {
  const passwordKey = await crypto.subtle.importKey('raw', textEncoder.encode(password), 'PBKDF2', false, [
    'deriveBits'
  ])

  const digest = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: textEncoder.encode(salt),
      iterations,
      hash: 'SHA-256'
    },
    passwordKey,
    256
  )

  return new Uint8Array(digest)
}

const assertObject = (value: unknown, message = 'Request body must be a JSON object') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, message)
  }

  return value as Record<string, unknown>
}

const assertString = (value: unknown, field: string) => {
  if (typeof value !== 'string') {
    throw new HttpError(400, `${field} is required`)
  }

  const trimmed = value.trim()
  if (!trimmed.length) {
    throw new HttpError(400, `${field} is required`)
  }

  return trimmed
}

const assertPassword = (value: unknown, field: string) => {
  if (typeof value !== 'string' || !value.length) {
    throw new HttpError(400, `${field} is required`)
  }

  return value
}

const assertUuid = (value: unknown, field: string) => {
  const identifier = assertString(value, field)
  if (!uuidPattern.test(identifier)) {
    throw new HttpError(400, `${field} must be a valid UUID`)
  }

  return identifier
}

const assertIsoDate = (value: unknown, field: string) => {
  const candidate = assertString(value, field)
  if (!isoDatePattern.test(candidate)) {
    throw new HttpError(400, `${field} must use YYYY-MM-DD format`)
  }

  return candidate
}

const assertRole = (value: unknown): AccountRole => {
  const candidate = assertString(value, 'role')
  if (!ACCOUNT_ROLES.includes(candidate as AccountRole)) {
    throw new HttpError(400, `role must be one of ${ACCOUNT_ROLES.join(', ')}`)
  }

  return candidate as AccountRole
}

const normalizeAccountUsername = (value: string) => value.trim().toLowerCase()

export const readJsonBody = async (req: Request) => {
  try {
    return assertObject(await req.json())
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }

    throw new HttpError(400, 'Invalid JSON body')
  }
}

export const parseLoginRequest = (payload: unknown) => {
  const body = assertObject(payload)
  return {
    role: assertRole(body.role),
    username: assertString(body.username, 'username'),
    password: assertPassword(body.password, 'password')
  }
}

export const parseCreateUserRequest = (payload: unknown) => {
  const body = assertObject(payload)
  return {
    username: assertString(body.username, 'username'),
    password: assertPassword(body.password, 'password')
  }
}

export const parseAssignDsrOwnerRequest = (payload: unknown) => {
  const body = assertObject(payload)
  return {
    userId: assertUuid(body.userId, 'userId')
  }
}

export const hashPassword = async (password: string) => {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16))
  const salt = bytesToHex(saltBytes)
  const iterations = 120000
  const digest = await derivePasswordDigest(password, salt, iterations)
  return `pbkdf2$${iterations}$${salt}$${bytesToHex(digest)}`
}

export const verifyPassword = async (password: string, storedHash: string) => {
  const [scheme, iterationText, salt, digest] = storedHash.split('$')
  if (scheme !== 'pbkdf2' || !iterationText || !salt || !digest) {
    return false
  }

  const iterations = Number(iterationText)
  if (!Number.isFinite(iterations) || iterations <= 0) {
    return false
  }

  try {
    const expectedDigest = hexToBytes(digest)
    const actualDigest = await derivePasswordDigest(password, salt, iterations)
    return constantTimeEqual(actualDigest, expectedDigest)
  } catch {
    return false
  }
}

export const issueAuthToken = async (account: AuthenticatedAccount) => {
  const payload: TokenPayload = {
    sub: account.id,
    role: account.role,
    username: account.username,
    exp: Date.now() + getAuthTokenTtlHours() * 60 * 60 * 1000
  }

  const encodedPayload = bytesToBase64Url(textEncoder.encode(JSON.stringify(payload)))
  const signature = bytesToBase64Url(await signValue(encodedPayload))
  return `${encodedPayload}.${signature}`
}

export const verifyAuthToken = async (token: string): Promise<AuthenticatedAccount> => {
  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature) {
    throw new HttpError(401, 'Invalid token')
  }

  let providedSignature: Uint8Array
  try {
    providedSignature = base64UrlToBytes(signature)
  } catch {
    throw new HttpError(401, 'Invalid token signature')
  }

  const expectedSignature = await signValue(encodedPayload)
  if (!constantTimeEqual(providedSignature, expectedSignature)) {
    throw new HttpError(401, 'Invalid token signature')
  }

  let payload: TokenPayload
  try {
    payload = JSON.parse(textDecoder.decode(base64UrlToBytes(encodedPayload))) as TokenPayload
  } catch {
    throw new HttpError(401, 'Invalid token payload')
  }

  if (!payload.sub || !payload.username || !payload.exp || !ACCOUNT_ROLES.includes(payload.role)) {
    throw new HttpError(401, 'Invalid token payload')
  }

  if (payload.exp < Date.now()) {
    throw new HttpError(401, 'Token expired')
  }

  return {
    id: payload.sub,
    username: payload.username,
    role: payload.role
  }
}

export const requireAuth = async (req: Request) => {
  const authorization = req.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Authorization header is required')
  }

  return verifyAuthToken(authorization.slice('Bearer '.length).trim())
}

export const requireRole = async (req: Request, role: AccountRole) => {
  const account = await requireAuth(req)
  if (account.role !== role) {
    throw new HttpError(403, 'You are not allowed to access this resource')
  }

  return account
}

export const ensureBootstrapAdmin = async (client: ServiceRoleClient) => {
  const { data: existingAdmin, error } = await client
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

  const { error: insertError } = await client.from('app_users').insert({
    username: normalizeAccountUsername(getBootstrapAdminUsername()),
    password_hash: await hashPassword(getBootstrapAdminPassword()),
    role: 'admin',
    created_by: null
  })

  if (insertError && !insertError.message.toLowerCase().includes('duplicate')) {
    throw new Error(`Unable to create bootstrap admin: ${insertError.message}`)
  }
}

export const authenticateAccount = async (
  client: ServiceRoleClient,
  payload: ReturnType<typeof parseLoginRequest>
) => {
  await ensureBootstrapAdmin(client)

  const normalizedUsername = normalizeAccountUsername(payload.username)
  const { data: account, error } = await client
    .from('app_users')
    .select('id, username, password_hash, role')
    .eq('username', normalizedUsername)
    .eq('role', payload.role)
    .maybeSingle<AppUserRow>()

  if (error) {
    throw new Error(`Unable to authenticate account: ${error.message}`)
  }

  if (!account || !(await verifyPassword(payload.password, account.password_hash))) {
    throw new HttpError(401, 'Invalid credentials')
  }

  const authenticatedAccount: AuthenticatedAccount = {
    id: account.id,
    username: account.username,
    role: account.role as AccountRole
  }

  return {
    token: await issueAuthToken(authenticatedAccount),
    account: authenticatedAccount
  }
}

export const listManagedUsers = async (client: ServiceRoleClient) => {
  await ensureBootstrapAdmin(client)

  const today = currentDate()
  const [{ data: users, error: usersError }, { data: assignment, error: assignmentError }] = await Promise.all([
    client
      .from('app_users')
      .select('id, username, role, created_by, created_at')
      .eq('role', 'user')
      .order('created_at', { ascending: true }),
    client.from('dsr_assignments').select('report_date, user_id').eq('report_date', today).maybeSingle()
  ])

  if (usersError) {
    throw new Error(`Unable to list user accounts: ${usersError.message}`)
  }

  if (assignmentError) {
    throw new Error(`Unable to load today's assignment: ${assignmentError.message}`)
  }

  const creatorIds = [...new Set((users ?? []).map((user) => user.created_by).filter(Boolean))] as string[]
  const creatorNames = new Map<string, string>()

  if (creatorIds.length) {
    const { data: creators, error: creatorsError } = await client.from('app_users').select('id, username').in('id', creatorIds)

    if (creatorsError) {
      throw new Error(`Unable to resolve user creators: ${creatorsError.message}`)
    }

    creators?.forEach((creator) => creatorNames.set(creator.id, creator.username))
  }

  return {
    todayDate: today,
    todayAssigneeId: assignment?.user_id ?? null,
    users: (users ?? []).map((user) => ({
      id: user.id,
      username: user.username,
      createdAt: user.created_at,
      createdBy: user.created_by ? (creatorNames.get(user.created_by) ?? 'unknown') : 'system'
    }))
  }
}

export const createManagedUser = async (
  client: ServiceRoleClient,
  payload: ReturnType<typeof parseCreateUserRequest>,
  createdBy: string
) => {
  const normalizedUsername = normalizeAccountUsername(payload.username)
  const { data: existingUser, error: existingUserError } = await client
    .from('app_users')
    .select('id')
    .eq('username', normalizedUsername)
    .maybeSingle()

  if (existingUserError) {
    throw new Error(`Unable to validate user account: ${existingUserError.message}`)
  }

  if (existingUser) {
    throw new HttpError(400, 'That username already exists')
  }

  const { data: createdUser, error } = await client
    .from('app_users')
    .insert({
      username: normalizedUsername,
      password_hash: await hashPassword(payload.password),
      role: 'user',
      created_by: createdBy
    })
    .select('id, username, created_by, created_at')
    .single<AppUserRow>()

  if (error || !createdUser) {
    throw new Error(`Unable to create user account: ${error?.message ?? 'Unknown error'}`)
  }

  return {
    id: createdUser.id,
    username: createdUser.username,
    createdAt: createdUser.created_at,
    createdBy
  }
}

export const deleteManagedUser = async (client: ServiceRoleClient, userId: string) => {
  const { data: existingUser, error: existingUserError } = await client
    .from('app_users')
    .select('id, username, role')
    .eq('id', assertUuid(userId, 'id'))
    .maybeSingle<AppUserRow>()

  if (existingUserError) {
    throw new Error(`Unable to validate user deletion: ${existingUserError.message}`)
  }

  if (!existingUser || existingUser.role !== 'user') {
    throw new HttpError(400, 'User account not found')
  }

  const { error } = await client.from('app_users').delete().eq('id', userId)
  if (error) {
    throw new Error(`Unable to delete user account: ${error.message}`)
  }

  return existingUser.username
}

export const assignTodayDsrUser = async (client: ServiceRoleClient, userId: string) => {
  const validatedUserId = assertUuid(userId, 'userId')
  const { data: existingUser, error: userError } = await client
    .from('app_users')
    .select('id, username, role')
    .eq('id', validatedUserId)
    .maybeSingle<AppUserRow>()

  if (userError) {
    throw new Error(`Unable to validate DSR assignee: ${userError.message}`)
  }

  if (!existingUser || existingUser.role !== 'user') {
    throw new HttpError(400, 'User account not found')
  }

  const today = currentDate()
  const { error } = await client.from('dsr_assignments').upsert(
    {
      report_date: today,
      user_id: validatedUserId
    },
    { onConflict: 'report_date' }
  )

  if (error) {
    throw new Error(`Unable to assign today's DSR owner: ${error.message}`)
  }

  return existingUser.username
}

export const assertUserCanSubmitReport = async (client: ServiceRoleClient, userId: string, reportDate: string) => {
  const targetDate = assertIsoDate(reportDate, 'reportDate')
  const today = currentDate()
  if (targetDate !== today) {
    return
  }

  const { data: assignment, error } = await client
    .from('dsr_assignments')
    .select('user_id')
    .eq('report_date', today)
    .maybeSingle()

  if (error) {
    throw new Error(`Unable to validate today's DSR assignment: ${error.message}`)
  }

  if (!assignment) {
    throw new HttpError(400, "No user has been assigned to submit today's DSR")
  }

  if (assignment.user_id !== userId) {
    throw new HttpError(400, "You are not assigned to submit today's DSR")
  }
}
