import { CreateUserRequestSchema } from '../shared/index.js'
import { supabase } from './supabaseClient.js'
import { ensureBootstrapAdmin, hashPassword, normalizeAccountUsername } from './authService.js'

type AppUserRow = {
  id: string
  username: string
  role: string
  created_by: string | null
  created_at: string
}

type AssignmentRow = {
  report_date: string
  user_id: string
}

export interface ManagedUser {
  id: string
  username: string
  createdAt: string
  createdBy: string | null
}

const currentDate = () => new Date().toISOString().slice(0, 10)

export const listManagedUsers = async () => {
  await ensureBootstrapAdmin()

  const today = currentDate()
  const [{ data: users, error: usersError }, { data: assignment, error: assignmentError }] = await Promise.all([
    supabase
      .from('app_users')
      .select('id, username, role, created_by, created_at')
      .eq('role', 'user')
      .order('created_at', { ascending: true }),
    supabase
      .from('dsr_assignments')
      .select('report_date, user_id')
      .eq('report_date', today)
      .maybeSingle<AssignmentRow>()
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
    const { data: creators, error: creatorsError } = await supabase
      .from('app_users')
      .select('id, username')
      .in('id', creatorIds)

    if (creatorsError) {
      throw new Error(`Unable to resolve user creators: ${creatorsError.message}`)
    }

    creators?.forEach((creator) => creatorNames.set(creator.id, creator.username))
  }

  return {
    todayDate: today,
    todayAssigneeId: assignment?.user_id ?? null,
    users: ((users ?? []) as AppUserRow[]).map((user) => ({
      id: user.id,
      username: user.username,
      createdAt: user.created_at,
      createdBy: user.created_by ? (creatorNames.get(user.created_by) ?? 'unknown') : 'system'
    })) satisfies ManagedUser[]
  }
}

export const createManagedUser = async (payload: unknown, createdBy: string) => {
  const parsed = CreateUserRequestSchema.parse(payload)
  const normalizedUsername = normalizeAccountUsername(parsed.username)

  const { data: existingUser, error: existingUserError } = await supabase
    .from('app_users')
    .select('id')
    .eq('username', normalizedUsername)
    .maybeSingle()

  if (existingUserError) {
    throw new Error(`Unable to validate user account: ${existingUserError.message}`)
  }

  if (existingUser) {
    throw new Error('That username already exists')
  }

  const { data: createdUser, error } = await supabase
    .from('app_users')
    .insert({
      username: normalizedUsername,
      password_hash: hashPassword(parsed.password),
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

export const deleteManagedUser = async (userId: string) => {
  const { data: existingUser, error: existingUserError } = await supabase
    .from('app_users')
    .select('id, username, role')
    .eq('id', userId)
    .maybeSingle<AppUserRow>()

  if (existingUserError) {
    throw new Error(`Unable to validate user deletion: ${existingUserError.message}`)
  }

  if (!existingUser || existingUser.role !== 'user') {
    throw new Error('User account not found')
  }

  const { error } = await supabase.from('app_users').delete().eq('id', userId)
  if (error) {
    throw new Error(`Unable to delete user account: ${error.message}`)
  }

  return existingUser.username
}

export const assignTodayDsrUser = async (userId: string) => {
  const { data: existingUser, error: userError } = await supabase
    .from('app_users')
    .select('id, username, role')
    .eq('id', userId)
    .maybeSingle<AppUserRow>()

  if (userError) {
    throw new Error(`Unable to validate DSR assignee: ${userError.message}`)
  }

  if (!existingUser || existingUser.role !== 'user') {
    throw new Error('User account not found')
  }

  const today = currentDate()
  const { error } = await supabase.from('dsr_assignments').upsert(
    {
      report_date: today,
      user_id: userId
    },
    { onConflict: 'report_date' }
  )

  if (error) {
    throw new Error(`Unable to assign today's DSR owner: ${error.message}`)
  }

  return existingUser.username
}

export const assertUserCanSubmitReport = async (userId: string, reportDate: string) => {
  const today = currentDate()
  if (reportDate !== today) {
    return
  }

  const { data: assignment, error } = await supabase
    .from('dsr_assignments')
    .select('user_id')
    .eq('report_date', today)
    .maybeSingle<AssignmentRow>()

  if (error) {
    throw new Error(`Unable to validate today's DSR assignment: ${error.message}`)
  }

  if (!assignment) {
    throw new Error("No user has been assigned to submit today's DSR")
  }

  if (assignment.user_id !== userId) {
    throw new Error("You are not assigned to submit today's DSR")
  }
}
