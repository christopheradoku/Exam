import { NextRequest, NextResponse } from "next/server"
import { isTeacherRequest } from "../../../../server/auth"
import { parseRawExamText } from "../../../../server/groq"
import type { ObjectiveQuestion, TheoryPart } from "../../../../src/lib/examTypes"

function localParse(text: string) {
  const lines = text.split(/\r?\n/)
  const paper1: ObjectiveQuestion[] = []
  const paper2: TheoryPart[] = []
  let current: ObjectiveQuestion | null = null
  let mode: "objective" | "theory" = "objective"
  let currentTheory: TheoryPart | null = null
  let currentTheoryPart: TheoryPart | null = null
  let equalEssayMarks = 0

  const extractMarks = (value: string) => {
    const match = value.match(/\[(\d+)\s*marks?\s*\]/i)
    return {
      text: value.replace(/\s*\[\d+\s*marks?\s*\]/i, "").trim(),
      marks: match ? Number(match[1]) : undefined,
    }
  }
  const addTheoryPart = (question: TheoryPart, labels: string[], value: string) => {
    const extracted = extractMarks(value)
    const label = labels.map((item) => `(${item})`).join("") || "Part"
    const idSuffix = labels.map((item) => item.toLowerCase()).join("-") || "part"
    const part: TheoryPart = {
      id: `${question.id}-${idSuffix}-${question.parts?.length || 0}`,
      label,
      prompt: extracted.text,
      marks: extracted.marks || 1,
    }
    question.parts ||= []
    question.parts.push(part)
    currentTheoryPart = part
  }
  const parseLabels = (value: string) => {
    const match = value.match(/^((?:\s*\((?:[a-z]+|[ivxlcdm]+|[α-ω]+)\)\s*)+)(.*)$/iu)
    if (!match) return null
    return {
      labels: [...match[1].matchAll(/\(([^)]+)\)/g)].map((item) => item[1]),
      rest: match[2].trim(),
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || /^[-=_*\s]{5,}$/.test(line)) continue
    if (/^paper\s*1\b/i.test(line) || /objective\s+test/i.test(line)) {
      mode = "objective"
      current = null
      continue
    }
    if (/^paper\s*2\b/i.test(line) || /essay\s*(?:\/|or)\s*theory|essay\s*\/\s*theory|theory\s+section/i.test(line)) {
      mode = "theory"
      current = null
      const equalMarks = text.match(/all questions carry equal marks\s*\[(\d+)\s*marks?/i)
      if (equalMarks) equalEssayMarks = Number(equalMarks[1])
      continue
    }
    if (/answer four questions in all|all questions carry equal marks/i.test(line)) {
      const equalMarks = line.match(/all questions carry equal marks\s*\[(\d+)\s*marks?/i)
      if (equalMarks) equalEssayMarks = Number(equalMarks[1])
      continue
    }

    if (mode === "objective") {
      const optionMatch = line.match(/^([A-E])\s*[.)]\s*(.+)$/i)
      if (optionMatch && current) {
        current.options.push({ id: `${current.id}-${optionMatch[1].toLowerCase()}`, label: optionMatch[1].toUpperCase(), text: optionMatch[2].trim() })
        continue
      }
      const questionMatch = line.match(/^(?:question\s*)?(\d+)\s*[.)]\s*(.+)$/i)
      if (questionMatch) {
        const extracted = extractMarks(questionMatch[2])
        current = {
          id: `q${questionMatch[1]}`,
          stem: extracted.text,
          options: [],
          marks: extracted.marks || 1,
        }
        paper1.push(current)
      } else if (current && !/^(?:section|time\s*:|\[\d+\s*marks?\])/i.test(line)) {
        current.stem = `${current.stem} ${line}`.trim()
      }
      continue
    }

    const topLevel = line.match(/^(?:question\s*)?(\d+)\s*[.)]\s*(.*)$/i)
    if (topLevel) {
      const prompt = topLevel[2].trim()
      const parsedLabels = parseLabels(prompt)
      const extracted = extractMarks(parsedLabels?.rest || prompt)
      currentTheory = {
        id: `t${topLevel[1]}`,
        label: topLevel[1],
        prompt: parsedLabels ? `Question ${topLevel[1]}` : extracted.text || `Question ${topLevel[1]}`,
        marks: equalEssayMarks || extracted.marks || 0,
        parts: [],
      }
      paper2.push(currentTheory)
      currentTheoryPart = null
      if (parsedLabels) addTheoryPart(currentTheory, parsedLabels.labels, extracted.text)
      else if (extracted.marks) currentTheory.marks = extracted.marks
      continue
    }

    const labelledPart = parseLabels(line)
    if (labelledPart && currentTheory) {
      const extracted = extractMarks(labelledPart.rest)
      addTheoryPart(currentTheory, labelledPart.labels, extracted.text)
      if (extracted.marks) currentTheoryPart!.marks = extracted.marks
      continue
    }
    const activeTheoryPart = currentTheoryPart as TheoryPart | null
    if (activeTheoryPart && line) {
      const extracted = extractMarks(line)
      activeTheoryPart.prompt = `${activeTheoryPart.prompt} ${extracted.text}`.trim()
      if (extracted.marks) activeTheoryPart.marks = extracted.marks
    } else if (currentTheory && line) {
      const extracted = extractMarks(line)
      currentTheory.prompt = `${currentTheory.prompt} ${extracted.text}`.trim()
      if (extracted.marks && !equalEssayMarks) currentTheory.marks = extracted.marks
    }
  }

  for (const question of paper1) {
    question.options = question.options.slice(0, 5)
  }
  for (const question of paper2) {
    if (equalEssayMarks) question.marks = equalEssayMarks
    else if (question.parts?.length) question.marks = question.parts.reduce((sum, part) => sum + part.marks, 0)
    if (!question.parts?.length) delete question.parts
  }
  for (let i = paper1.length - 1; i >= 0; i--) if (paper1[i].options.length < 2) paper1.splice(i, 1)
  return { paper1, paper2 }
}

export async function POST(request: NextRequest) {
  if (!isTeacherRequest(request)) return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  const body = await request.json().catch(() => null) as { rawText?: string } | null
  if (!body?.rawText?.trim()) return NextResponse.json({ error: "Paste exam text to parse." }, { status: 400 })
  if (body.rawText.length > 100_000) return NextResponse.json({ error: "Exam text must be under 100,000 characters." }, { status: 413 })
  try {
    const local = localParse(body.rawText)
    if (local.paper1.length || local.paper2.length)
      return NextResponse.json({ ...local, source: "local" })
    if (process.env.GROQ_API_KEY)
      return NextResponse.json({ ...(await parseRawExamText(body.rawText)), source: "groq" })
    throw new Error("No numbered exam questions were found. Include question numbers, objective options, or theory subparts.")
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to parse the exam text." }, { status: 422 })
  }
}
