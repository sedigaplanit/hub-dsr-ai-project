import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import type { DailyReportPayload, TrainingStatus } from '@shared'
import {
  assignTodayDsrOwner,
  createUserAccount,
  deleteUserAccount,
  downloadMonthlyWorkbook,
  fetchAdminUsers,
  fetchEmployees,
  fetchReports,
  login,
  submitReport,
  type ApiDailyReport,
  type AuthSession,
  type EmployeeDirectoryEntry
} from './lib/api'
import { createEmptyTrainingRow, statusPalette } from './lib/dsr-helpers'
import './App.css'

const queryClient = new QueryClient()
type TrainingFormRow = ReturnType<typeof createEmptyTrainingRow>
type AppView = 'user-login' | 'admin-login' | 'user-app' | 'admin-app'

const getViewFromHash = (hash: string): AppView => {
  if (hash === '#/admin-login') {
    return 'admin-login'
  }

  if (hash === '#/app') {
    return 'user-app'
  }

  if (hash === '#/admin') {
    return 'admin-app'
  }

  return 'user-login'
}

const setHash = (hash: '#/login' | '#/admin-login' | '#/app' | '#/admin') => {
  window.location.hash = hash
}

function Providers() {
  return (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  )
}

function App() {
  const today = dayjs().format('YYYY-MM-DD')
  const [view, setView] = useState<AppView>(() =>
    typeof window === 'undefined' ? 'user-login' : getViewFromHash(window.location.hash)
  )
  const [session, setSession] = useState<AuthSession | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [accountUsername, setAccountUsername] = useState('')
  const [accountPassword, setAccountPassword] = useState('')
  const [adminError, setAdminError] = useState<string | null>(null)
  const [reportDate, setReportDate] = useState(today)
  const [employeeId, setEmployeeId] = useState('')
  const [trainings, setTrainings] = useState<TrainingFormRow[]>([createEmptyTrainingRow()])
  const [certs, setCerts] = useState({ istqbDone: false, caeDone: false, istqbTargetDate: '', caeTargetDate: '' })
  const [cvStatus, setCvStatus] = useState<'done' | 'sent_for_review' | 'not_started'>('not_started')
  const [cvTargetDate, setCvTargetDate] = useState('')
  const [blockers, setBlockers] = useState('')
  const [notes, setNotes] = useState('')
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    if (!window.location.hash) {
      setHash('#/login')
    }

    const syncView = () => setView(getViewFromHash(window.location.hash))
    syncView()
    window.addEventListener('hashchange', syncView)

    return () => window.removeEventListener('hashchange', syncView)
  }, [])

  let currentView = view
  if (view === 'user-app' && session?.account.role !== 'user') {
    currentView = 'user-login'
  }
  if (view === 'admin-app' && session?.account.role !== 'admin') {
    currentView = 'admin-login'
  }

  const token = session?.token ?? ''

  const {
    data: employees = [],
    isFetching: isEmployeesFetching,
    error: employeesError
  } = useQuery<EmployeeDirectoryEntry[]>({
    queryKey: ['employees', token],
    queryFn: () => fetchEmployees(token),
    enabled: currentView === 'user-app' && Boolean(token)
  })

  const { data: reports, isFetching, refetch } = useQuery<ApiDailyReport[]>({
    queryKey: ['reports', token, reportDate],
    queryFn: () => fetchReports(token, reportDate),
    enabled: currentView === 'user-app' && Boolean(token)
  })

  const {
    data: adminUsers,
    isFetching: isAdminUsersFetching,
    error: adminUsersError,
    refetch: refetchAdminUsers
  } = useQuery({
    queryKey: ['admin-users', token],
    queryFn: () => fetchAdminUsers(token),
    enabled: currentView === 'admin-app' && session?.account.role === 'admin' && Boolean(token)
  })

  const reportMonth = useMemo(() => reportDate.slice(0, 7), [reportDate])

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === employeeId) ?? null,
    [employees, employeeId]
  )

  const assignedUser = useMemo(
    () => adminUsers?.users.find((user) => user.id === adminUsers.todayAssigneeId) ?? null,
    [adminUsers]
  )

  const mutation = useMutation({
    mutationFn: (payload: DailyReportPayload) => submitReport(token, payload),
    onSuccess: () => {
      setToast({ message: 'DSR saved successfully', tone: 'success' })
      refetch()
    },
    onError: (error) => {
      setToast({ message: (error as Error).message, tone: 'error' })
    }
  })

  const trainingValidationNotice = useMemo(() => {
    const etaToday = trainings.find((row) => row.etaDate === reportDate && row.status !== 'completed')
    if (etaToday) {
      return `Task "${etaToday.title || 'Unnamed'}" has ETA today. Please mark it completed or adjust the target date.`
    }
    return ''
  }, [trainings, reportDate])

  const handleSubmit = () => {
    const payload: DailyReportPayload = {
      employeeId,
      reportDate,
      trainings: trainings.filter((row) => row.title.trim().length > 0),
      blockers: blockers || undefined,
      notes: notes || undefined,
      certificationProgress: {
        istqbDone: certs.istqbDone,
        istqbTargetDate: certs.istqbTargetDate || undefined,
        caeDone: certs.caeDone,
        caeTargetDate: certs.caeTargetDate || undefined
      },
      cvStatus: {
        status: cvStatus,
        targetDate: cvTargetDate || undefined
      }
    }

    mutation.mutate(payload)
  }

  const updateTraining = (index: number, field: keyof TrainingFormRow, value: string) => {
    setTrainings((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, [field]: value } : row))
    )
  }

  const updateStatus = (index: number, status: TrainingStatus) => {
    setTrainings((prev) => prev.map((row, idx) => (idx === index ? { ...row, status } : row)))
  }

  const addRow = () => setTrainings((rows) => [...rows, createEmptyTrainingRow()])

  const removeRow = (index: number) => {
    setTrainings((rows) => rows.filter((_, idx) => idx !== index))
  }

  const handleDownload = async () => {
    try {
      await downloadMonthlyWorkbook(token, reportMonth)
    } catch (error) {
      setToast({ message: (error as Error).message, tone: 'error' })
    }
  }

  const openUserLogin = () => {
    setAuthError(null)
    setHash('#/login')
  }

  const openAdminLogin = () => {
    setAuthError(null)
    setHash('#/admin-login')
  }

  const handleUserLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!username.trim() || !password) {
      setAuthError('Enter a username and password.')
      return
    }

    try {
      const nextSession = await login('user', username, password)
      setSession(nextSession)
      setAuthError(null)
      setToast(null)
      setPassword('')
      setHash('#/app')
    } catch (error) {
      setAuthError((error as Error).message)
    }
  }

  const handleAdminLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!adminUsername.trim() || !adminPassword) {
      setAuthError('Enter an admin username and password.')
      return
    }

    try {
      const nextSession = await login('admin', adminUsername, adminPassword)
      setSession(nextSession)
      setAuthError(null)
      setToast(null)
      setAdminPassword('')
      setHash('#/admin')
    } catch (error) {
      setAuthError((error as Error).message)
    }
  }

  const handleLogout = () => {
    const nextHash = session?.account.role === 'admin' ? '#/admin-login' : '#/login'
    setSession(null)
    setAuthError(null)
    setAdminError(null)
    setToast(null)
    queryClient.clear()
    setHash(nextHash)
  }

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!token) {
      setAdminError('Admin session missing.')
      return
    }

    try {
      await createUserAccount(token, accountUsername, accountPassword)
      setAccountUsername('')
      setAccountPassword('')
      setAdminError(null)
      setToast({ message: `User ${accountUsername.trim().toLowerCase()} created.`, tone: 'success' })
      await refetchAdminUsers()
    } catch (error) {
      setAdminError((error as Error).message)
    }
  }

  const handleAssignUser = async (userId: string) => {
    if (!token) {
      setAdminError('Admin session missing.')
      return
    }

    try {
      const result = await assignTodayDsrOwner(token, userId)
      setAdminError(null)
      setToast({ message: result.message, tone: 'success' })
      await refetchAdminUsers()
    } catch (error) {
      setAdminError((error as Error).message)
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!token) {
      setAdminError('Admin session missing.')
      return
    }

    try {
      const result = await deleteUserAccount(token, userId)
      setAdminError(null)
      setToast({ message: result.message, tone: 'success' })
      await refetchAdminUsers()
    } catch (error) {
      setAdminError((error as Error).message)
    }
  }

  if (currentView === 'user-login') {
    return (
      <div className="auth-shell">
        <section className="panel auth-panel">
          <p className="eyebrow">Hub Access</p>
          <h1>User Login</h1>
          <p className="auth-copy">Sign in with a user account created by the admin.</p>

          <form className="auth-form" onSubmit={handleUserLogin}>
            <label>
              Username
              <input
                type="text"
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value)
                  setAuthError(null)
                }}
                placeholder="Enter your username"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  setAuthError(null)
                }}
                placeholder="Enter your password"
              />
            </label>

            {authError ? <p className="notice error auth-notice">{authError}</p> : null}

            <div className="auth-actions">
              <button type="button" className="ghost" onClick={openAdminLogin}>
                Login as admin
              </button>
              <button type="submit" className="primary" disabled={!username.trim() || !password}>
                Login
              </button>
            </div>
          </form>
        </section>
      </div>
    )
  }

  if (currentView === 'admin-login') {
    return (
      <div className="auth-shell">
        <section className="panel auth-panel">
          <p className="eyebrow">Hub Access</p>
          <h1>Admin Login</h1>
          <p className="auth-copy">Admin access is required to create users, set passwords, and assign today's DSR owner.</p>
          <p className="helper-text">Default backend admin credentials are <code>admin</code> / <code>admin123</code> unless overridden in API env.</p>

          <form className="auth-form" onSubmit={handleAdminLogin}>
            <label>
              Username
              <input
                type="text"
                value={adminUsername}
                onChange={(event) => {
                  setAdminUsername(event.target.value)
                  setAuthError(null)
                }}
                placeholder="Enter your admin username"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={adminPassword}
                onChange={(event) => {
                  setAdminPassword(event.target.value)
                  setAuthError(null)
                }}
                placeholder="Enter your admin password"
              />
            </label>

            {authError ? <p className="notice error auth-notice">{authError}</p> : null}

            <div className="auth-actions">
              <button type="button" className="ghost" onClick={openUserLogin}>
                Back to user login
              </button>
              <button type="submit" className="primary" disabled={!adminUsername.trim() || !adminPassword}>
                Login
              </button>
            </div>
          </form>
        </section>
      </div>
    )
  }

  if (currentView === 'admin-app') {
    return (
      <div className="app-shell">
        <div className="workspace-bar panel">
          <div>
            <p className="eyebrow">Hub Administration</p>
            <strong>{session?.account.username}</strong>
          </div>
          <div className="auth-actions compact-actions">
            <button type="button" className="ghost" onClick={openUserLogin}>
              Go to user login
            </button>
            <button type="button" className="primary" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>

        <div className="admin-grid">
          <section className="panel admin-panel">
            <div>
              <p className="eyebrow">Account Creation</p>
              <h2>Create User Account</h2>
              <p className="helper-text">Only the admin can create user accounts and passwords.</p>
            </div>

            <form className="account-form" onSubmit={handleCreateUser}>
              <label>
                Username
                <input
                  type="text"
                  value={accountUsername}
                  onChange={(event) => {
                    setAccountUsername(event.target.value)
                    setAdminError(null)
                  }}
                  placeholder="Enter a new username"
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  value={accountPassword}
                  onChange={(event) => {
                    setAccountPassword(event.target.value)
                    setAdminError(null)
                  }}
                  placeholder="Set a password"
                />
              </label>

              {adminError ? <p className="notice error auth-notice">{adminError}</p> : null}
              {adminUsersError ? <p className="notice error auth-notice">{(adminUsersError as Error).message}</p> : null}

              <button type="submit" className="primary" disabled={!accountUsername.trim() || !accountPassword}>
                Create user
              </button>
            </form>

            <div className="assignment-card">
              <span className="summary-label">Today's DSR owner</span>
              <strong>{assignedUser?.username ?? 'Not assigned yet'}</strong>
              <p className="helper-text">
                {assignedUser
                  ? `${assignedUser.username} is responsible for sending today's DSR report.`
                  : 'Assign one user to own today\'s DSR submission.'}
              </p>
            </div>
          </section>

          <section className="panel admin-panel">
            <div>
              <p className="eyebrow">User Accounts</p>
              <h2>Manage Users</h2>
              <p className="helper-text">Create, appoint, and delete user accounts from this panel.</p>
            </div>

            {isAdminUsersFetching ? <p className="helper-text">Loading users…</p> : null}

            {adminUsers?.users.length ? (
              <ul className="account-list">
                {adminUsers.users.map((account) => {
                  const isAssigned = account.id === adminUsers.todayAssigneeId
                  return (
                    <li key={account.id} className={isAssigned ? 'account-row active' : 'account-row'}>
                      <div className="account-meta">
                        <strong>{account.username}</strong>
                        <p>Created by {account.createdBy ?? 'system'}</p>
                        <p>{isAssigned ? `Assigned for ${adminUsers.todayDate}` : 'Not assigned today'}</p>
                      </div>

                      <div className="account-actions">
                        <button type="button" className="ghost" onClick={() => handleAssignUser(account.id)}>
                          {isAssigned ? 'Assigned' : 'Assign today'}
                        </button>
                        <button type="button" className="danger" onClick={() => handleDeleteUser(account.id)}>
                          Delete user
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="helper-text">No user accounts yet. Create one from the form on the left.</p>
            )}
          </section>
        </div>

        {toast ? (
          <div className={`toast ${toast.tone}`} onAnimationEnd={() => setToast(null)}>
            {toast.message}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="workspace-bar panel">
        <div>
          <p className="eyebrow">Signed In</p>
          <strong>{session?.account.username}</strong>
        </div>
        <button className="ghost" onClick={handleLogout}>
          Logout
        </button>
      </div>

      <div className="field-grid">
        <section className="panel form-panel">
          <header>
            <div>
              <p className="eyebrow">Hub · Bench</p>
              <h1>Daily Status Report</h1>
            </div>
            <div className="actions">
              <button className="ghost" onClick={handleDownload}>
                Download {reportMonth} XLSX
              </button>
              <button className="primary" onClick={handleSubmit} disabled={mutation.isPending || !employeeId}>
                {mutation.isPending ? 'Saving…' : 'Save DSR'}
              </button>
            </div>
          </header>

          {reportDate === today ? (
            <p className="notice">Only the user assigned by the admin can submit today's DSR.</p>
          ) : null}

          <div className="form-row">
            <label>
              Employee
              <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} disabled={isEmployeesFetching || !employees.length}>
                <option value="">
                  {isEmployeesFetching ? 'Loading employees…' : employees.length ? 'Select an employee' : 'No employees found'}
                </option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.full_name} · {employee.pod ?? 'Hub'} · {employee.location ?? 'Remote'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Report Date
              <input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
            </label>
          </div>

          {employeesError ? (
            <p className="notice error">{(employeesError as Error).message || 'Unable to load the employee directory.'}</p>
          ) : null}

          {selectedEmployee ? (
            <div className="employee-summary">
              <div>
                <p className="summary-label">Selected employee</p>
                <strong>{selectedEmployee.full_name}</strong>
                <p>
                  {selectedEmployee.capability ?? 'General capability'} · {selectedEmployee.pod ?? 'Hub'} · {selectedEmployee.location ?? 'Remote'}
                </p>
              </div>
              <span>{selectedEmployee.email}</span>
            </div>
          ) : isEmployeesFetching ? (
            <p className="helper-text">Loading employee directory…</p>
          ) : employeesError ? (
            <p className="helper-text">Employee directory unavailable. Check the API and Supabase connection.</p>
          ) : (
            <p className="helper-text">
              {employees.length
                ? 'Select an employee from the directory before saving the report.'
                : 'Seed the employees table to enable DSR submissions.'}
            </p>
          )}

          <div className="form-section">
            <div className="section-heading">
              <h2>Trainings & Upskilling</h2>
              <button type="button" className="ghost" onClick={addRow}>
                Add Row
              </button>
            </div>
            <div className="training-list">
              {trainings.map((row, index) => (
                <article key={row.id} className="training-card">
                  <div className="row-header">
                    <strong>Task {index + 1}</strong>
                    {trainings.length > 1 ? (
                      <button className="text" onClick={() => removeRow(index)}>
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <label>
                    Title
                    <input value={row.title} onChange={(event) => updateTraining(index, 'title', event.target.value)} placeholder="E.g., Azure DevOps course" />
                  </label>
                  <div className="two-column">
                    <label>
                      Learning Type
                      <select value={row.learningType} onChange={(event) => updateTraining(index, 'learningType', event.target.value)}>
                        <option value="course">Course</option>
                        <option value="shadowing">Shadowing</option>
                        <option value="certification">Certification</option>
                        <option value="internal">Internal</option>
                      </select>
                    </label>
                    <label>
                      ETA
                      <input type="date" value={row.etaDate} onChange={(event) => updateTraining(index, 'etaDate', event.target.value)} />
                    </label>
                  </div>
                  <div className="two-column">
                    <label>
                      Target Date
                      <input type="date" value={row.targetDate} onChange={(event) => updateTraining(index, 'targetDate', event.target.value)} />
                    </label>
                    <label>
                      Notes
                      <input value={row.notes} onChange={(event) => updateTraining(index, 'notes', event.target.value)} placeholder="Optional context" />
                    </label>
                  </div>
                  <div className="status-pills">
                    {statusPalette.map((status) => (
                      <button
                        type="button"
                        key={status.value}
                        className={row.status === status.value ? 'pill active' : 'pill'}
                        style={{ background: row.status === status.value ? status.color : undefined }}
                        onClick={() => updateStatus(index, status.value)}
                      >
                        {status.label}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="form-section grid-two">
            <section>
              <h3>Certification Progress</h3>
              <div className="cert-grid">
                <label className={certs.istqbDone ? 'toggle active' : 'toggle'}>
                  <span>ISTQB</span>
                  <input type="checkbox" checked={certs.istqbDone} onChange={(event) => setCerts((prev) => ({ ...prev, istqbDone: event.target.checked }))} />
                </label>
                {!certs.istqbDone && (
                  <input type="date" value={certs.istqbTargetDate} onChange={(event) => setCerts((prev) => ({ ...prev, istqbTargetDate: event.target.value }))} placeholder="Target date" />
                )}
                <label className={certs.caeDone ? 'toggle active' : 'toggle'}>
                  <span>CAE</span>
                  <input type="checkbox" checked={certs.caeDone} onChange={(event) => setCerts((prev) => ({ ...prev, caeDone: event.target.checked }))} />
                </label>
                {!certs.caeDone && (
                  <input type="date" value={certs.caeTargetDate} onChange={(event) => setCerts((prev) => ({ ...prev, caeTargetDate: event.target.value }))} placeholder="Target date" />
                )}
              </div>
            </section>
            <section>
              <h3>CV Status</h3>
              <div className="cv-options">
                {['done', 'sent_for_review', 'not_started'].map((status) => (
                  <button
                    key={status}
                    className={cvStatus === status ? 'pill active' : 'pill'}
                    onClick={() => setCvStatus(status as typeof cvStatus)}
                  >
                    {status.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
              {cvStatus !== 'done' && (
                <label>
                  Target Date
                  <input type="date" value={cvTargetDate} onChange={(event) => setCvTargetDate(event.target.value)} />
                </label>
              )}
            </section>
          </div>

          <div className="form-row">
            <label>
              Blockers
              <textarea rows={3} value={blockers} onChange={(event) => setBlockers(event.target.value)} placeholder="Mention blockers or dependencies" />
            </label>
            <label>
              Highlights / Notes
              <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Wins, next focus, review comments" />
            </label>
          </div>

          {trainingValidationNotice ? <p className="notice">{trainingValidationNotice}</p> : null}
        </section>

        <aside className="panel insights-panel">
          <header>
            <p className="eyebrow">Team Timeline</p>
            <h2>{dayjs(reportDate).format('ddd, DD MMM YYYY')}</h2>
          </header>
          {isFetching ? <p>Loading team progress…</p> : null}
          <ul className="report-list">
            {reports && reports.length ? (
              reports.map((entry) => (
                <li key={entry.report.id}>
                  <div>
                    <strong>{entry.report.employee.full_name}</strong>
                    <p>{entry.report.employee.pod ?? 'Hub'} · {entry.report.employee.location ?? 'Remote'}</p>
                  </div>
                  <span className={`badge ${entry.trainings.every((task) => task.status === 'completed') ? 'success' : 'pending'}`}>
                    {entry.trainings.every((task) => task.status === 'completed') ? 'Ready' : 'In Flight'}
                  </span>
                </li>
              ))
            ) : (
              <p>No submissions yet.</p>
            )}
          </ul>
        </aside>
      </div>

      {toast ? (
        <div className={`toast ${toast.tone}`} onAnimationEnd={() => setToast(null)}>
          {toast.message}
        </div>
      ) : null}
    </div>
  )
}

export default Providers
