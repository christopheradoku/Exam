import type { Metadata } from "next"
import "../src/index.css"

export const metadata: Metadata = {
  title: "WASSCE Online | Secure Examination Portal",
  description: "Teacher dashboard for secure WASSCE examinations, proctoring, and grading.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
