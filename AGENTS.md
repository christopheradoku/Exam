# WASSCE Exam Portal

## Development

This project uses Next.js 16 with the App Router, TypeScript, and Tailwind CSS v4. Start the application with `pnpm dev`; the configured preview port is 8443. Build with `pnpm build` and run the production server with `pnpm start`.

## Project Structure

- `app/layout.tsx` - Root HTML layout and page metadata
- `app/page.tsx` - Home route
- `src/App.tsx` - Interactive client dashboard
- `src/index.css` - Global stylesheet and Tailwind import
- `src/hooks` - Browser-only React hooks, including webcam proctoring
- `src/lib` - Shared exam types and client-safe utilities
- `server` - Server-only service functions; never import these into client components
- `prisma/schema.prisma` - Database schema

## Styling

Tailwind CSS v4 is wired through `@tailwindcss/postcss` in `postcss.config.mjs`. Global styles are imported by `app/layout.tsx`. Keep CSS `@import` statements at the top of `src/index.css`.

## Secrets

Keep API keys and passwords in server environment variables. Do not expose `GROQ_API_KEY` or `COMPREFACE_API_KEY` through `NEXT_PUBLIC_*` variables or client components.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
