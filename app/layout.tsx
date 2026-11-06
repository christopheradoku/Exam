import type { Metadata, Viewport } from "next"
import "../src/index.css"

export const metadata: Metadata = {
  title: "Virtual Exam | Secure Examination Portal",
  description: "Student accounts, assigned examinations, proctoring, and teacher grading in one secure portal.",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
