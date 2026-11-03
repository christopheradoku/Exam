import { NextRequest, NextResponse } from "next/server"
import { isTeacherRequest } from "../../../../server/auth"

export function GET(request: NextRequest) {
  return NextResponse.json({ authenticated: isTeacherRequest(request) })
}
