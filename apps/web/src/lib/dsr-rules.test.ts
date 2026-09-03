import { DailyReportSchema, deriveCertificationHeadline } from '@shared'

describe('deriveCertificationHeadline', () => {
  test('returns Done when both certifications are complete', () => {
    expect(
      deriveCertificationHeadline({
        istqbDone: true,
        caeDone: true
      })
    ).toBe('Done')
  })

  test('includes the remaining certification target date when only one is done', () => {
    expect(
      deriveCertificationHeadline({
        istqbDone: true,
        caeDone: false,
        caeTargetDate: '2026-09-15'
      })
    ).toBe('ISTQB - Done & CAE yet to complete (Target 2026-09-15)')
  })
})

describe('DailyReportSchema', () => {
  test('accepts a complete payload', () => {
    const result = DailyReportSchema.safeParse({
      employeeId: '11111111-1111-1111-1111-111111111111',
      reportDate: '2026-09-03',
      trainings: [
        {
          title: 'Azure DevOps learning path',
          learningType: 'course',
          status: 'in_progress',
          etaDate: '2026-09-04',
          targetDate: '2026-09-05',
          notes: 'Module 3 this week'
        }
      ],
      certificationProgress: {
        istqbDone: false,
        istqbTargetDate: '2026-09-20',
        caeDone: false,
        caeTargetDate: '2026-09-27'
      },
      cvStatus: {
        status: 'sent_for_review',
        targetDate: '2026-09-10'
      },
      blockers: 'Awaiting sandbox access',
      notes: 'Following up with the reviewer'
    })

    expect(result.success).toBe(true)
  })

  test('rejects invalid identifiers and underspecified training tasks', () => {
    const result = DailyReportSchema.safeParse({
      employeeId: 'not-a-uuid',
      reportDate: '2026-09-03',
      trainings: [
        {
          title: 'Hi',
          learningType: 'course',
          status: 'in_progress',
          etaDate: '2026-09-04'
        }
      ],
      certificationProgress: {
        istqbDone: false,
        caeDone: false
      },
      cvStatus: {
        status: 'not_started'
      }
    })

    expect(result.success).toBe(false)

    if (!result.success) {
      const issuePaths = result.error.issues.map((issue) => issue.path.join('.'))
      expect(issuePaths).toEqual(expect.arrayContaining(['employeeId', 'trainings.0.title']))
    }
  })
})
