import { NextRequest, NextResponse } from "next/server"
import { isTeacherRequest } from "../../../server/auth"

export function GET(request: NextRequest) {
  if (!isTeacherRequest(request))
    return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  return NextResponse.json({
    groqConfigured: !!process.env.GROQ_API_KEY,
  })
}
