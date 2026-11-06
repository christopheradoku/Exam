import { NextRequest, NextResponse } from "next/server"
import { getStudentForRequest } from "../../../../server/studentAuth"

export async function GET(request: NextRequest) {
  const student = await getStudentForRequest(request)
  return NextResponse.json(
    { authenticated: Boolean(student), student },
    { headers: { "Cache-Control": "private, no-store" } },
  )
}
