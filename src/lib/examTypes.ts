export type ObjectiveOption = { id: string; label: string; text: string }

export type ObjectiveQuestion = {
  id: string
  stem: string
  options: ObjectiveOption[]
  /** Stable option id; shuffling never changes the answer key. */
  correctOptionId?: string
  marks?: number
}

export type TheoryPart = {
  id: string
  label?: string
  prompt: string
  marks: number
  expectedAnswer?: string
  rubric?: Array<{ criterion: string; marks: number }>
  parts?: TheoryPart[]
}

export type ExamPayload = {
  examId: string
  paper1: ObjectiveQuestion[]
  paper2: TheoryPart[]
}

