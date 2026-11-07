export type StudentStatus = "pending" | "active" | "disabled"

export type StudentProfile = {
  id: string
  studentNumber: string
  waecCandidateNumber?: string
  fullName: string
  classId: string
  className: string
  status: StudentStatus
  mustChangePassword?: boolean
}

export type StudentClass = {
  id: string
  name: string
  createdAt: string
}

export type StudentAggregate = {
  total: number
  subjects: Array<{ subject: string; grade: string; points: number }>
  complete: boolean
}

export type StudentExamAssignment = {
  id: string
  title: string
  subject: string
  startTime: string
  endTime: string
  durationMinutes: number
  status: "upcoming" | "ready" | "in-progress" | "expired" | "locked" | "submitted" | "graded"
  attemptsUsed: number
  maxAttempts: number
  attemptsRemaining: number
  canRetry: boolean
  attemptHistory: Array<{
    id: string
    submittedAt: string
    objectiveScore: number
    objectiveMax: number
    theoryScore?: number
    theoryMax?: number
    status: "submitted" | "graded"
    teacherReviewed?: boolean
    grade?: string
  }>
  attempt?: {
    id: string
    submittedAt: string
    objectiveScore: number
    objectiveMax: number
    theoryScore?: number
    theoryMax?: number
    status: "submitted" | "locked" | "graded"
    teacherReviewed?: boolean
    grade?: string
  }
  paper2Pending?: boolean
}
