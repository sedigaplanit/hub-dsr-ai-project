import { useMemo, useState } from 'react'
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import type { DailyReportPayload, TrainingStatus } from '@shared'
import {
  fetchReports,
  submitReport,
  downloadWorkbook,
  fetchEmployees,
  type ApiDailyReport,
  type EmployeeDirectoryEntry
} from './lib/api'
import { createEmptyTrainingRow, statusPalette } from './lib/dsr-helpers'
import './App.css'

const queryClient = new QueryClient()
type TrainingFormRow = ReturnType<typeof createEmptyTrainingRow>

function Providers() {
  return (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  )
}

function App() {
  const today = dayjs().format('YYYY-MM-DD')
  const [reportDate, setReportDate] = useState(today)
  const [employeeId, setEmployeeId] = useState('')
  const [trainings, setTrainings] = useState<TrainingFormRow[]>([createEmptyTrainingRow()])
  const [certs, setCerts] = useState({ istqbDone: false, caeDone: false, istqbTargetDate: '', caeTargetDate: '' })
  const [cvStatus, setCvStatus] = useState<'done' | 'sent_for_review' | 'not_started'>('not_started')
  const [cvTargetDate, setCvTargetDate] = useState('')
  const [blockers, setBlockers] = useState('')
  const [notes, setNotes] = useState('')
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)

  const {
    data: employees = [],
    isFetching: isEmployeesFetching,
    error: employeesError
  } = useQuery<EmployeeDirectoryEntry[]>({
    queryKey: ['employees'],
    queryFn: fetchEmployees
  })

  const { data: reports, isFetching, refetch } = useQuery<ApiDailyReport[]>({
    queryKey: ['reports', reportDate],
    queryFn: () => fetchReports(reportDate)
  })

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === employeeId) ?? null,
    [employees, employeeId]
  )

  const mutation = useMutation({
    mutationFn: (payload: DailyReportPayload) => submitReport(payload),
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
      await downloadWorkbook(reportDate)
    } catch (error) {
      setToast({ message: (error as Error).message, tone: 'error' })
    }
  }

  return (
    <div className="app-shell">
      <div className="field-grid">
        <section className="panel form-panel">
          <header>
            <div>
              <p className="eyebrow">Hub · Bench</p>
              <h1>Daily Status Report</h1>
            </div>
            <div className="actions">
              <button className="ghost" onClick={handleDownload}>
                Download XLSX
              </button>
              <button className="primary" onClick={handleSubmit} disabled={mutation.isPending || !employeeId}>
                {mutation.isPending ? 'Saving…' : 'Save DSR'}
              </button>
            </div>
          </header>

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
