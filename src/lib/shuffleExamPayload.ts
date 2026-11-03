import type { ExamPayload, ObjectiveOption } from "./examTypes"

function hashSeed(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619)
  return hash >>> 0
}

function randomFor(seed: string) {
  let state = hashSeed(seed) || 0x9e3779b9
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/** Seed should be generated and stored by the server for each attempt. */
export function shuffleExamPayload(
  payload: ExamPayload,
  seed: string,
  previousSeeds: string[] = [],
): ExamPayload {
  const priorLayouts = new Set(previousSeeds.map((pastSeed) =>
    pastSeed === "__original__" ? layoutSignature(payload) : layoutSignature(shuffleOnce(payload, pastSeed)),
  ))
  let candidate = seed
  let shuffledPayload = shuffleOnce(payload, candidate)
  // Avoid repeating any recorded layout when a different permutation is possible.
  for (let retry = 1; priorLayouts.has(layoutSignature(shuffledPayload)) && retry <= 100; retry++) {
    candidate = `${seed}:${retry}`
    shuffledPayload = shuffleOnce(payload, candidate)
  }
  return shuffledPayload
}

function layoutSignature(payload: ExamPayload): string {
  return JSON.stringify([
    payload.paper1.map((question) => [question.id, question.options.map((option) => option.id)]),
    payload.paper2.map((question) => question.id),
  ])
}

function shuffleOnce(payload: ExamPayload, seed: string): ExamPayload {
  const random = randomFor(`${payload.examId}:${seed}`)
  return {
    ...payload,
    paper1: shuffled(payload.paper1, random).map((question) => ({
      ...question,
      options: shuffled<ObjectiveOption>(question.options, random).map((option, index) => ({
        ...option,
        label: String.fromCharCode(65 + index),
      })),
    })),
    // Nested parts stay attached to their parent while top-level theory questions move.
    paper2: shuffled(payload.paper2, random).map((question) => ({
      ...question,
      parts: question.parts?.map((part) => ({ ...part })),
    })),
  }
}

