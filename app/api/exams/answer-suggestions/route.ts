import { NextRequest, NextResponse } from "next/server"
import { isTeacherRequest } from "../../../../server/auth"
import { suggestExamAnswers } from "../../../../server/groq"
import type { ObjectiveQuestion, TheoryPart } from "../../../../src/lib/examTypes"

export async function POST(request: NextRequest) {
  if (!isTeacherRequest(request)) return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: "Add GROQ_API_KEY to .env.local to generate AI answer suggestions." }, { status: 503 })
  const body = await request.json().catch(() => null) as { paper1?: ObjectiveQuestion[]; paper2?: TheoryPart[] } | null
  if (!body || !Array.isArray(body.paper1) || !Array.isArray(body.paper2)) return NextResponse.json({ error: "Review questions are missing." }, { status: 400 })
  try {
    const suggestions = await suggestExamAnswers({ paper1: body.paper1, paper2: body.paper2 })
    const paper1 = (suggestions.paper1 || []).flatMap((suggestion) => {
      const question = body.paper1!.find((item) => item.id === suggestion.id)
      if (!question) return []
      const option = question.options.find((item) => item.id === suggestion.correctOptionId || item.label.toUpperCase() === suggestion.correctOptionId?.toUpperCase())
      return option ? [{ ...suggestion, correctOptionId: option.id }] : []
    })
    const paper2 = (suggestions.paper2 || []).filter((suggestion) => body.paper2!.some((item) => item.id === suggestion.id))
    return NextResponse.json({ paper1, paper2 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Groq could not suggest answers." }, { status: 502 })
  }
}
