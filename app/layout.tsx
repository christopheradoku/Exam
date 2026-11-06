import type { Metadata, Viewport } from "next"
import "../src/index.css"

export const metadata: Metadata = {
  title: "Virtual Exam | Secure Examination Portal",
  description: "Teacher dashboard for secure virtual examinations, proctoring, and grading.",
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
