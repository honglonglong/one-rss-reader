# OneRSSReader

A privacy-first, client-side RSS reader built as a Progressive Web App (PWA). All data is stored locally in your browser — no account, no server, no tracking.

## Features

- **RSS Feed Management** — Add, edit, and delete RSS feeds. Organize feeds into custom groups.
- **OPML Import / Export** — Import your existing subscriptions from any RSS reader, or export them for backup or migration.
- **Offline Reading (PWA)** — Install as a desktop/mobile app. Previously fetched articles remain readable without internet access.
- **Highlights & Annotations** — Select text in any article to highlight it. Add personal notes to highlights.
- **Marks & Notes View** — Review all your highlights and notes across articles in one dedicated view.
- **Markdown Export** — Export any article along with its highlights and notes as a Markdown file.
- **Unread Counts** — Unread article badges on each feed and group, so you can see at a glance what's new.
- **Reading Settings** — Adjust font family, font size, line height, and content width for a comfortable reading experience.
- **Dark / Light Theme** — Follows your system preference, with a manual toggle.
- **No Backend Required** — The only server-side component is a CORS-bypass proxy (`/api/proxy`) for fetching RSS feeds. All data lives in your browser's IndexedDB.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router), React 19 |
| UI | shadcn/ui + Tailwind CSS v4 |
| State / Cache | SWR |
| Storage | IndexedDB via `idb` |
| RSS Parsing | `rss-parser` (server-side proxy) |
| PWA | Service Worker |

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deploy to Vercel

The easiest way to deploy is via [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fhonglonglong%2Fone-rss-reader)

No environment variables are required. The `/api/proxy` route runs as a serverless function on Vercel automatically.

## Self-Hosting

Any platform that supports Next.js works:

- **Vercel** — Zero config, recommended.
- **Netlify** — Use `@netlify/plugin-nextjs`.
- **Docker** — `next build && next start` behind any reverse proxy (nginx, Caddy, etc.).
- **Node.js server** — `pnpm build && pnpm start`.

## License

MIT — see [LICENSE](LICENSE) for details.
