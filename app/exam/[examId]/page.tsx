import StudentExam from "../../../src/StudentExam"

export default async function StudentExamPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params
  return <StudentExam examId={examId} />
}
