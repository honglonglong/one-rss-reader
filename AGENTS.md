# OneRSSReader — Agent Instructions

A client-side RSS reader built as a Next.js PWA. All data persists in IndexedDB (no backend database).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router), React 19 |
| UI Components | shadcn/ui (copy-pasted into `components/ui/`) |
| Styling | Tailwind CSS v4 |
| State / Cache | SWR + React hooks |
| Storage | IndexedDB via `idb` library (`lib/db.ts`) |
| RSS Parsing | `rss-parser` — server-side only via `/api/proxy` (CORS bypass) |
| Icons | Lucide React |
| Toasts | Sonner |
| PWA | Service Worker at `public/sw.js` |

## Build & Run

```bash
pnpm dev        # Dev server on port 3000
pnpm build      # Production build (TypeScript errors are ignored — see note below)
pnpm start      # Serve production build
pnpm lint       # ESLint
```

> **No test framework is configured.** `next.config.mjs` sets `ignoreBuildErrors: true` — TypeScript compile errors won't block builds.

## Architecture

```
app/page.tsx          ← 3-column layout: Feeds | Articles | Reader
app/api/proxy/        ← Server route: RSS fetch & parse (avoids CORS)
components/           ← Feature components + shadcn/ui in components/ui/
hooks/                ← All IndexedDB access goes through custom hooks
lib/db.ts             ← Raw IndexedDB CRUD (lazy singleton, DB_VERSION = 1)
lib/types.ts          ← Core data model (Feed, Article, Highlight, ReadingSettings)
lib/rss-parser.ts     ← parseFeed() → calls /api/proxy, sanitizes HTML
public/sw.js          ← PWA service worker (network-first for navigation; cache-first for assets)
```

**Data flow:** `Component → Hook (SWR cache) → lib/db.ts (IndexedDB)`. Mutations call `mutate()` to refresh SWR cache.

## Conventions

- **All components are client components** (`'use client'`). No server components outside `app/`.
- **UI components** live in `components/ui/` (shadcn copy-paste pattern). Do not install shadcn as a package — add components by copying from the shadcn registry.
- **`cn()` utility** from `lib/utils.ts` (clsx + tailwind-merge) for conditional class names.
- **File naming**: kebab-case for all component and lib files.
- **Path alias**: `@/` maps to the project root.
- **Mobile breakpoint**: 1024px, detected via `useIsMobile()` in `hooks/use-mobile.ts`.
- **New types**: Add to `lib/types.ts`, then update `lib/db.ts` schema if storage is needed.
- **New settings**: Add field to `ReadingSettings` in `lib/types.ts`, then persist via `hooks/use-reading-settings.ts`.

## Key Pitfalls

- **No IndexedDB migration strategy** — `DB_VERSION` is hard-coded to `1`. Adding new object stores requires bumping the version and adding an `upgrade` handler in `lib/db.ts`, or existing client databases will not be upgraded.
- **No article deduplication on refresh** — `refresh()` in `use-feeds.ts` calls `addArticles()` without a link-based uniqueness check; repeated refreshes can create duplicate article records.
- **Feed groups are denormalized** — stored as a string field on each `Feed`. Rename/delete a group by iterating all feeds — there's no dedicated group store.
- **Highlights are not cascade-deleted** — deleting an article orphans its highlights in IndexedDB.
- **API route is network-only in SW** — `/api/proxy` is always fetched from the network; RSS articles are only available offline if already stored in IndexedDB.
