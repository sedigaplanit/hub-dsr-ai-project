import ExcelJS from 'npm:exceljs@4.4.0'
import {
  COLUMN_KEYS,
  STATUS_COLOR_HEX,
  deriveCertificationHeadline
} from '../../../packages/shared/src/core.ts'
import { createServiceRoleClient } from './database.ts'
import { formatSheetName, formatWorkbookDate, type AggregatedDailyReport } from './dsr.ts'

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

interface SheetTemplateSnapshot {
  columnWidths: Array<number | undefined>
  titleFont?: ExcelJS.Font
  titleAlignment?: ExcelJS.Alignment
  titleFill?: ExcelJS.Fill
  headerFont?: ExcelJS.Font
  headerFill?: ExcelJS.Fill
  headerAlignment?: ExcelJS.Alignment
}

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>

const cloneValue = <T>(value: T): T => {
  if (value == null) {
    return value
  }

  return JSON.parse(JSON.stringify(value)) as T
}

const captureTemplateSnapshot = (sheet?: ExcelJS.Worksheet | null): SheetTemplateSnapshot | null => {
  if (!sheet) {
    return null
  }

  const titleCell = sheet.getCell('A1')
  const headerCell = sheet.getRow(3).getCell(1)
  return {
    columnWidths: headerRow.map((_, index) => sheet.getColumn(index + 1).width),
    titleFont: cloneValue(titleCell.font),
    titleAlignment: cloneValue(titleCell.alignment),
    titleFill: cloneValue(titleCell.fill),
    headerFont: cloneValue(headerCell.font),
    headerFill: cloneValue(headerCell.fill),
    headerAlignment: cloneValue(headerCell.alignment)
  }
}

const loadTemplateSnapshot = async (
  client: ServiceRoleClient
) => {
  const bucket = Deno.env.get('DSR_TEMPLATE_BUCKET')
  const objectPath = Deno.env.get('DSR_TEMPLATE_OBJECT_PATH') ?? 'Hub_DSR_Template.xlsx'

  if (!bucket) {
    return null
  }

  const { data, error } = await client.storage.from(bucket).download(objectPath)
  if (error || !data) {
    return null
  }

  const workbook = new ExcelJS.Workbook()
  const templateBuffer = new Uint8Array(await data.arrayBuffer())
  await workbook.xlsx.load(templateBuffer as unknown as ExcelLoadBuffer)
  return captureTemplateSnapshot(workbook.worksheets[0])
}

const applySheetSkeleton = (
  sheet: ExcelJS.Worksheet,
  reportDate: string,
  templateSnapshot: SheetTemplateSnapshot | null
) => {
  sheet.mergeCells('A1:L1')
  sheet.getCell('A1').value = `Hub - Daily Status Report - ${formatWorkbookDate(reportDate)}`
  sheet.getCell('A1').font = templateSnapshot?.titleFont ?? { size: 18, bold: true }
  sheet.getCell('A1').alignment = templateSnapshot?.titleAlignment ?? { vertical: 'middle' }
  if (templateSnapshot?.titleFill) {
    sheet.getCell('A1').fill = templateSnapshot.titleFill
  }

  if (templateSnapshot?.columnWidths.length) {
    templateSnapshot.columnWidths.forEach((width, index) => {
      sheet.getColumn(index + 1).width = width ?? 22
    })
  } else {
    sheet.columns = headerRow.map(() => ({ width: 22 }))
  }

  const header = sheet.getRow(3)
  header.values = headerRow
  header.font = templateSnapshot?.headerFont ?? { bold: true }
  header.alignment = templateSnapshot?.headerAlignment ?? { vertical: 'middle' }
  if (templateSnapshot?.headerFill) {
    header.eachCell((cell) => {
      cell.fill = templateSnapshot.headerFill
    })
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
  return task.status === 'completed' && task.eta_date < reportDate
}

const toExcelColor = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`

const writeDailySheet = (
  sheet: ExcelJS.Worksheet,
  reportDate: string,
  reports: AggregatedDailyReport[]
) => {
  let currentRow = 4

  reports.forEach(({ report, trainings, certification }) => {
    const effectiveTrainings = trainings.filter((training) => !shouldSkipTask(training, report.report_date))
    if (!effectiveTrainings.length) {
      effectiveTrainings.push({
        daily_report_id: report.id,
        id: crypto.randomUUID(),
        learning_type: 'N/A',
        title: 'Carried Forward / Planning',
        status: 'in_progress',
        eta_date: reportDate,
        target_date: reportDate,
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
      row.getCell(COLUMN_KEYS.eta).value = formatWorkbookDate(training.target_date ?? training.eta_date)
      row.getCell(COLUMN_KEYS.notes).value = training.notes ?? ''
      row.getCell(COLUMN_KEYS.status).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {
          argb: toExcelColor(
            STATUS_COLOR_HEX[training.status as keyof typeof STATUS_COLOR_HEX] ?? '#FFFFFF'
          )
        }
      }

      row.commit()
      currentRow += 1
    })
  })
}

export const buildMonthlyWorkbook = async (
  client: ServiceRoleClient,
  month: string,
  dailyReports: Array<[string, AggregatedDailyReport[]]>
) => {
  const workbook = new ExcelJS.Workbook()
  const templateSnapshot = await loadTemplateSnapshot(client)

  dailyReports.forEach(([reportDate, reports]) => {
    const sheet = workbook.addWorksheet(formatSheetName(reportDate))
    applySheetSkeleton(sheet, reportDate, templateSnapshot)
    writeDailySheet(sheet, reportDate, reports)
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return {
    buffer: buffer as Uint8Array,
    fileName: `hub-dsr-${month}.xlsx`
  }
}
