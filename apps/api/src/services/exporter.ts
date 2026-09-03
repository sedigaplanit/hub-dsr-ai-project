import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import ExcelJS from 'exceljs'
import dayjs from 'dayjs'
import { env } from '../env.js'
import type { AggregatedDailyReport } from './dsrService.js'
import {
  COLUMN_KEYS,
  STATUS_COLOR_HEX,
  deriveCertificationHeadline
} from '../shared/index.js'

const headerRow = [
  'Employee Name',
  'POD',
  'Location',
  'Capability',
  'Training / Upskilling',
  'Learning Type',
  'Status',
  'Target / ETA',
  'Notes',
  'Certification Status',
  'CV Status',
  'Blockers / Remarks'
]

type ExcelLoadBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0]

const ensureTemplateWorkbook = async (): Promise<ExcelJS.Workbook> => {
  const workbook = new ExcelJS.Workbook()
  try {
    const templatePath = path.resolve(env.DSR_TEMPLATE_PATH)
    const templateBuffer = await fs.readFile(templatePath)
    await workbook.xlsx.load(templateBuffer as unknown as ExcelLoadBuffer)
    return workbook
  } catch (error) {
    const sheet = workbook.addWorksheet('Hub DSR')
    sheet.mergeCells('A1:L1')
    sheet.getCell('A1').value = 'Hub - Daily Status Report'
    sheet.getCell('A1').font = { size: 18, bold: true }
    sheet.getRow(3).values = headerRow
    sheet.getRow(3).font = { bold: true }
    sheet.columns = headerRow.map(() => ({ width: 22 }))
    return workbook
  }
}

const pickCvStatusLabel = (status: string, hasFeedback: boolean) => {
  if (status === 'sent_for_review' && !hasFeedback) {
    return 'Done'
  }
  if (status === 'sent_for_review' && hasFeedback) {
    return 'Sent for Review'
  }
  if (status === 'done') {
    return 'Done'
  }
  return 'Not Started'
}

const shouldSkipTask = (task: { status: string; eta_date: string }, reportDate: string) => {
  return task.status === 'completed' && dayjs(task.eta_date).isBefore(dayjs(reportDate), 'day')
}

const toExcelColor = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`

export async function buildWorkbookBuffer(date: string, reports: AggregatedDailyReport[]) {
  const template = await ensureTemplateWorkbook()
  const sheet = template.worksheets[0] ?? template.addWorksheet('Hub DSR')

  const header = sheet.getRow(3)
  header.values = headerRow
  header.font = { bold: true }

  // clear existing rows beyond headers
  const startRow = 4
  const lastRowNumber = sheet.lastRow?.number ?? startRow
  for (let i = lastRowNumber; i >= startRow; i -= 1) {
    sheet.spliceRows(i, 1)
  }

  let currentRow = startRow
  reports.forEach(({ report, trainings, certification }) => {
    const effectiveTrainings = trainings.filter((training) => !shouldSkipTask(training, report.report_date))
    if (!effectiveTrainings.length) {
      effectiveTrainings.push({
        daily_report_id: report.id,
        id: randomUUID(),
        learning_type: 'N/A',
        title: 'Carried Forward / Planning',
        status: 'in_progress',
        eta_date: report.report_date,
        target_date: report.report_date,
        notes: null,
        created_at: report.created_at
      })
    }

    effectiveTrainings.forEach((training, index) => {
      const row = sheet.getRow(currentRow)
      if (index === 0) {
        row.getCell(COLUMN_KEYS.employeeName).value = report.employee.full_name
        row.getCell(COLUMN_KEYS.pod).value = report.employee.pod ?? 'Hub'
        row.getCell(COLUMN_KEYS.location).value = report.employee.location ?? 'N/A'
        row.getCell(COLUMN_KEYS.capability).value = report.employee.capability ?? 'N/A'
        row.getCell(COLUMN_KEYS.certificationSummary).value = certification
          ? deriveCertificationHeadline({
              istqbDone: certification.istqb_done,
              istqbTargetDate: certification.istqb_target_date ?? undefined,
              caeDone: certification.cae_done,
              caeTargetDate: certification.cae_target_date ?? undefined
            })
          : 'Not Started'
        const hasFeedback = Boolean(report.notes?.toLowerCase().includes('review'))
        row.getCell(COLUMN_KEYS.cvStatus).value = pickCvStatusLabel(report.cv_status, hasFeedback)
        row.getCell(COLUMN_KEYS.blockers).value = report.blockers ?? report.notes ?? ''
      }

      row.getCell(COLUMN_KEYS.taskTitle).value = training.title
      row.getCell(COLUMN_KEYS.learningType).value = training.learning_type
      row.getCell(COLUMN_KEYS.status).value = training.status.replace(/_/g, ' ').toUpperCase()
      row.getCell(COLUMN_KEYS.eta).value = dayjs(training.target_date ?? training.eta_date).format('DD-MMM-YYYY')
      row.getCell(COLUMN_KEYS.notes).value = training.notes ?? ''

      const color = STATUS_COLOR_HEX[training.status as keyof typeof STATUS_COLOR_HEX] ?? '#FFFFFF'
      row.getCell(COLUMN_KEYS.status).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: toExcelColor(color) }
      }

      row.commit()
      currentRow += 1
    })
  })

  return template.xlsx.writeBuffer()
}
