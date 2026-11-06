import { NextResponse } from "next/server"
import { getStudentStore } from "../../../../server/studentStore"

export async function GET() {
  const store = await getStudentStore()
  return NextResponse.json(
    { classes: store.classes.map(({ id, name }) => ({ id, name })) },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
  )
}
