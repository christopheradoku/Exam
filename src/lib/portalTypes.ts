import type { ObjectiveQuestion, TheoryPart } from "./examTypes"

export type GradeBand = {
  label: string
  minimum: number
  maximum: number
}

export const defaultGradeBands: GradeBand[] = [
  { label: "A", minimum: 80, maximum: 100 },
  { label: "B", minimum: 70, maximum: 79 },
  { label: "C", minimum: 60, maximum: 69 },
  { label: "D", minimum: 50, maximum: 59 },
  { label: "E", minimum: 40, maximum: 49 },
  { label: "F", minimum: 0, maximum: 39 },
]

export type ExamAttempt = {
  id: string
  studentId?: string
  candidateName: string
  candidateNumber: string
  submittedAt: string
  objectiveScore: number
  objectiveMax: number
  theoryScore?: number
  theoryMax?: number
  theoryReport?: Array<{ questionId: string; awardedMarks: number; maxMarks: number; workedOutSolution: string; feedback: string }>
  photoAnswers?: Record<string, string>
  teacherReviewed?: boolean
  status: "submitted" | "locked" | "graded"
  warnings: number
  reshuffleCount: number
  shuffleSeed?: string
  answers: Record<string, string>
}

export type PortalExam = {
  id: string
  title: string
  subject: string
  accessCode: string
  startTime: string
  endTime: string
  durationMinutes: number
  lookAwayWarningSecs: number
  lockoutThresholdSecs: number
  maxWarnings: number
  maxRetries: number
  maxAttempts: number
  gradeBands: GradeBand[]
  photoUploadWindowMinutes?: number
  photoUploadWindows?: Record<string, { openedAt: string; closesAt: string }>
  candidateStartTimes?: Record<string, { startedAt: string; deadlineAt: string }>
  questions: { paper1: ObjectiveQuestion[]; paper2: TheoryPart[] }
  attempts: ExamAttempt[]
  createdAt: string
}
