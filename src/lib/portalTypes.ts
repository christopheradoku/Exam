import type { ObjectiveQuestion, TheoryPart } from "./examTypes"

export type ExamAttempt = {
  id: string
  candidateName: string
  candidateNumber: string
  submittedAt: string
  objectiveScore: number
  objectiveMax: number
  theoryScore?: number
  theoryMax?: number
  theoryReport?: Array<{ questionId: string; awardedMarks: number; maxMarks: number; workedOutSolution: string; feedback: string }>
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
  questions: { paper1: ObjectiveQuestion[]; paper2: TheoryPart[] }
  attempts: ExamAttempt[]
  createdAt: string
}
