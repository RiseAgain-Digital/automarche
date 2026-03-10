# automarche

A webapp for supermarket receiving operations. When supplier trucks arrive, warehouse workers scan each delivered product with a barcode scanner — that data enters their backend system. The supplier also hands over a paper invoice (called a **fatura** in Portuguese). Sometimes what was scanned does not match what the invoice says. automarche closes that gap: workers upload a photo of the paper invoice, an OCR automation reads it, and the app highlights every discrepancy so nothing slips through.

---

## Table of Contents

1. [What the App Does](#1-what-the-app-does)
2. [Architecture Overview](#2-architecture-overview)
3. [How a Node.js / Next.js App Actually Works](#3-how-a-nodejs--nextjs-app-actually-works)
4. [Technology Stack — What, Why, and How](#4-technology-stack--what-why-and-how)
5. [Folder and File Structure](#5-folder-and-file-structure)
6. [Database Schema](#6-database-schema)
7. [Authentication Flow](#7-authentication-flow)
8. [The n8n OCR Flow — Step by Step](#8-the-n8n-ocr-flow--step-by-step)
9. [API Routes Reference](#9-api-routes-reference)
10. [Environment Variables](#10-environment-variables)
11. [Local Development Setup — From Zero](#11-local-development-setup--from-zero)
12. [Docker — What It Is and How It Is Used Here](#12-docker--what-it-is-and-how-it-is-used-here)
13. [Future Deployment — Kubernetes Direction](#13-future-deployment--kubernetes-direction)
14. [Common Issues and Troubleshooting](#14-common-issues-and-troubleshooting)

---

## 1. What the App Does

### The Business Problem

A supermarket chain receives deliveries from many suppliers every day. Each delivery involves:

1. A truck arrives at the loading dock.
2. Workers scan every item off the truck using a barcode scanner. That data goes into the warehouse management system and represents what was **physically received**.
3. The supplier hands over a paper invoice stating what they claim to have delivered.

If the two do not match — for example the invoice says 50 boxes of olive oil but the scanner only recorded 48 — the supermarket either overpays or fails to dispute the shortage. Reconciling these differences manually is slow and error-prone.

### What automarche Does

automarche is the reconciliation tool. It:

- Lets workers register a **fatura** (invoice) and upload a photo of it.
- Sends the photo to an OCR (optical character recognition) automation that reads the numbers off the paper.
- Stores both the OCR-extracted invoice items and the barcode-scanned items.
- Automatically computes **discrepancies**: products where the quantities differ.
- Puts faturas through a status workflow: `PENDENTE` → `PROCESSANDO` → `EM_REVISAO` or `APROVADO`.
- Provides a **kanban board** so teams can manage the review work visually.
- Lets supervisors create **tasks** tied to faturas, assign them to workers, and track time.
- Maintains a **product catalog** that can be imported from Excel.
- Shows a **dashboard** with live metrics: how many faturas are awaiting review, approval rate, daily stats.

### The Five Pages

| Page | URL | Purpose |
|------|-----|---------|
| Dashboard | `/dashboard` | Live metrics and recent faturas overview |
| Kanban | `/kanban` | Drag-and-drop board for fatura status management |
| Gestão de Tarefas | `/tarefas` | Full task list, filtering, time tracking |
| Produtos | `/produtos` | Product catalog with search and Excel import |
| Operacional | `/operacional` | Fatura list, upload, discrepancy review |

---

## 2. Architecture Overview

### System Diagram

```
                        BROWSER
                           |
               +-----------+-----------+
               |                       |
          Page Requests           API Calls
          (HTML/React)         (JSON via fetch)
               |                       |
               v                       v
        +-------------------------------+
        |        NEXT.JS SERVER         |
        |  (runs inside Node.js)        |
        |                               |
        |  /app/(app)/...   = Pages     |
        |  /app/api/...     = REST API  |
        |                               |
        |  lib/auth.ts  = Auth logic    |
        |  lib/db.ts    = DB client     |
        +------+------------------------+
               |
               | SQL queries via Prisma
               v
        +-------------------------------+
        |         POSTGRESQL            |
        |  (running in Docker)          |
        +-------------------------------+


        FATURA IMAGE UPLOAD FLOW
        ========================

  Worker uploads photo
          |
          v
  POST /api/faturas/:id/upload
  (saves file to /public/uploads/)
          |
          | HTTP POST (fire-and-forget)
          v
  +---------------+
  |     n8n       |  (running in Docker on port 5678)
  | OCR Workflow  |
  +---------------+
          |
          | Reads image URL
          | Calls OCR service (e.g. Google Vision, Tesseract, etc.)
          | Parses line items
          |
          | HTTP POST to /api/webhooks/n8n
          v
  POST /api/webhooks/n8n
  (stores FaturaItems, computes Discrepancies,
   updates fatura status to EM_REVISAO or APROVADO)
          |
          v
  Browser polls via React Query
  (refetchInterval: 30s on dashboard)
  Worker sees updated status + discrepancies
```

### Key Principle: Monolith

This app is a **monolith** — one codebase, one process, one deployment unit. The frontend (what users see in the browser) and the backend (the API that talks to the database) live in the same Next.js project. There is no separate "backend server" to run. This is simpler to deploy and reason about for a team-sized application.

---

## 3. How a Node.js / Next.js App Actually Works

This section is for readers who are not deeply familiar with modern web frameworks.

### What Is Node.js?

Node.js is a JavaScript runtime — it lets you run JavaScript code on a server (not just in a browser). This project's server is a Node.js process.

### What Is Next.js?

Next.js is a framework built on top of Node.js and React. It does two things at once:

1. **Serves web pages** — it takes React components (`.tsx` files) and turns them into HTML that the browser can display.
2. **Runs an API server** — files under `src/app/api/` become HTTP endpoints (like a mini Express server).

### Server Components vs. Client Components

Next.js has two kinds of React components:

**Server Components** (the default):
- Run on the server, never in the browser.
- Can directly call the database, read environment variables, check sessions.
- Cannot use browser APIs, event listeners, or React hooks like `useState`.
- The `(app)/layout.tsx` is a server component — it checks the session on the server before sending any HTML.

**Client Components** (marked with `"use client"` at the top of the file):
- Downloaded to the browser and run in JavaScript on the user's machine.
- Can use `useState`, `useEffect`, event handlers, browser APIs.
- Cannot directly touch the database — they must call the API instead.
- Most page components in this project (`dashboard/page.tsx`, etc.) are client components because they use React Query hooks.

### The Request Lifecycle

When a user navigates to `/dashboard`:

1. Browser sends `GET /dashboard` to the Next.js server.
2. Next.js runs the `(app)/layout.tsx` server component, which calls `auth.api.getSession()` to check if the user is logged in. If not, it redirects to `/login`.
3. If logged in, Next.js renders the `dashboard/page.tsx` component on the server and sends the initial HTML to the browser.
4. The browser loads the JavaScript bundle. React "hydrates" — it attaches event handlers to the server-rendered HTML.
5. React Query hooks inside the page component fire: they call `fetch('/api/metrics')` and `fetch('/api/faturas?pageSize=5')`.
6. The API route handlers (`src/app/api/metrics/route.ts`, etc.) run on the server, query PostgreSQL via Prisma, and return JSON.
7. React Query stores the responses in memory cache and re-renders the page with the data.
8. Every 30 seconds, React Query automatically refetches to keep the data fresh.

### What Is a REST API?

A REST API (Representational State Transfer) is a convention for structuring HTTP communication between a frontend and a backend. It uses:

- `GET` — retrieve data (e.g., `GET /api/faturas` returns a list of faturas)
- `POST` — create something new (e.g., `POST /api/faturas` creates a new fatura)
- `PATCH` — update part of something (e.g., `PATCH /api/faturas/:id` updates a fatura's status)
- `DELETE` — remove something (e.g., `DELETE /api/faturas/:id` deletes a fatura)

The `:id` part is a URL parameter — the actual fatura ID goes there (e.g., `/api/faturas/clx4abc123`).

---

## 4. Technology Stack — What, Why, and How

### Next.js 16 (with React 19)

**What it is:** A React framework that handles routing, server-side rendering, API routes, and bundling (compiling TypeScript + CSS into what the browser can actually run).

**Why we chose it:** It lets us write the frontend and backend in one project, in the same language (TypeScript). The App Router feature (introduced in Next.js 13, used here) enables powerful patterns like route groups and server components. Having one deployment artifact instead of two separate services (a React SPA + an Express API) keeps operations simpler.

**How it is used here:** Every `.tsx` file under `src/app/` is either a page or an API route. The folder structure defines the URLs.

---

### TypeScript

**What it is:** TypeScript is JavaScript with types. You can annotate variables, function parameters, and return values with their expected shapes. The TypeScript compiler (`tsc`) checks these at build time and catches bugs before they reach production.

**Why we chose it:** When working with database records, API responses, and form data, bugs often come from passing the wrong shape of data. TypeScript catches those mistakes. Prisma auto-generates TypeScript types from the database schema, which means the entire stack — from database to UI — is type-checked.

**How it is used here:** All source files use `.ts` or `.tsx`. Types for shared data shapes live in `src/types/index.ts`. Prisma generates types for every model in `node_modules/.prisma/client`.

---

### Tailwind CSS v4

**What it is:** A utility-first CSS framework. Instead of writing a CSS file with classes like `.card { padding: 16px; border-radius: 8px; }`, you apply pre-defined utility classes directly in your HTML/JSX: `<div className="p-4 rounded-lg">`.

**Why we chose it:** You never have to context-switch between a `.tsx` file and a `.css` file. The design system (spacing, colors, typography) is enforced by the fixed set of utilities. Tailwind v4 moves configuration into a `postcss.config.mjs` file rather than `tailwind.config.js`, which is simpler.

**How it is used here:** Classes like `bg-slate-900`, `text-white`, `flex`, `gap-3`, `rounded-xl`, and `border-slate-100` appear throughout components. There is virtually no custom CSS — `src/app/globals.css` only imports Tailwind.

---

### PostgreSQL

**What it is:** A relational database. Data is stored in tables with rows and columns. Tables reference each other through foreign keys (e.g., a `FaturaItem` row has a `faturaId` column that points to a row in the `Fatura` table). PostgreSQL is one of the most robust open-source databases available.

**Why we chose it:** The data model here is highly relational — faturas have items, items reference products, tasks reference faturas and users. A relational database with foreign keys and transactions is the correct tool. PostgreSQL is battle-tested, free, and has excellent support in the Node.js ecosystem.

**How it is used here:** Running in a Docker container (see `docker-compose.yml`). The app connects to it via the `DATABASE_URL` environment variable.

---

### Prisma v7

**What it is:** An ORM (Object-Relational Mapper). An ORM sits between your application code and the database. Instead of writing raw SQL like `SELECT * FROM "Fatura" WHERE status = 'EM_REVISAO'`, you write TypeScript: `prisma.fatura.findMany({ where: { status: 'EM_REVISAO' } })`. Prisma translates that into SQL.

**Why we chose it:**
- **Schema-first:** You define the database structure in `prisma/schema.prisma` in a readable DSL (domain-specific language). Prisma generates both the SQL migrations and the TypeScript types.
- **Type safety:** Every query returns correctly typed results. If you try to access a field that does not exist on a model, TypeScript will tell you at compile time.
- **Migrations:** The `prisma/migrations/` folder contains the full SQL history of every schema change, making it safe and reproducible to evolve the database over time.

**The Driver Adapter (important for v7):** Prisma v7 changed its internal engine architecture. In older versions, the connection string was specified in `schema.prisma` and Prisma managed the connection pool internally. In v7, you must create a `PrismaPg` driver adapter from the `pg` library and pass it to the `PrismaClient` constructor. This is why `src/lib/db.ts` does:

```typescript
const adapter = new PrismaPg({ connectionString });
const client = new PrismaClient({ adapter });
```

If you try to run Prisma v7 without the adapter (as you would with older tutorials), you will get an error like `Cannot read properties of undefined` or a connection refused error. This is not a bug — it is the required API for v7.

The connection string (`DATABASE_URL`) is no longer put in `schema.prisma`. Instead it goes in `prisma.config.ts`, which Prisma's CLI reads at migration time.

**The Singleton Pattern:** Next.js in development mode uses hot-reload — when you save a file, it re-imports the changed module. Without a singleton, every hot-reload would create a new `PrismaClient` instance, each opening new database connections. PostgreSQL has a connection limit (default 100). You would exhaust it in minutes. The singleton in `src/lib/db.ts` stores the client on `globalThis` (a Node.js global that persists across hot-reloads) so only one instance ever exists per process:

```typescript
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

In production, modules are only imported once, so this guard is only needed in development.

---

### BetterAuth v1

**What it is:** An authentication library. Authentication means: "prove who you are" (login) and "remember who you are" (sessions). BetterAuth handles the login form, password hashing, session tokens, and session validation.

**Why we chose it over NextAuth / Auth.js:**
- NextAuth has evolved through several breaking API changes and its documentation is often inconsistent between versions.
- BetterAuth has a cleaner, more explicit API that is easier to understand and debug.
- It has a first-class Prisma adapter — it uses your existing Prisma models (`User`, `Session`, `Account`, `Verification`) rather than managing its own separate database tables.
- It is framework-agnostic; the server config in `src/lib/auth.ts` works in any Node.js context.

**How it is used here:** Email + password authentication is enabled. Sessions last 7 days. The server config (`src/lib/auth.ts`) is used in API routes to call `auth.api.getSession({ headers })`. The browser client (`src/lib/auth-client.ts`) is used in components to call `signIn`, `signOut`, and `useSession`. The `(app)/layout.tsx` server component calls `auth.api.getSession()` on every authenticated page — if no session exists, it redirects to `/login`.

The BetterAuth handler at `src/app/api/auth/[...betterauth]/route.ts` handles all auth HTTP traffic (login, logout, session refresh) at the `/api/auth/*` path.

---

### TanStack React Query v5

**What it is:** A library for managing server state (data that lives in your database, fetched over the network) in React applications.

**The problem it solves:** Without React Query, you would write something like:

```typescript
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);

useEffect(() => {
  fetch('/api/faturas')
    .then(r => r.json())
    .then(d => { setData(d); setLoading(false); })
    .catch(e => { setError(e); setLoading(false); });
}, []);
```

This pattern has problems: no caching (every component re-fetches), no background refresh, no deduplication (two components asking for the same data make two separate requests), error handling is manual.

**What React Query provides:**
- **Cache:** Data is cached by a `queryKey`. If two components both use `useQuery({ queryKey: ['faturas'] })`, only one network request is made.
- **Background refetch:** `refetchInterval: 30000` in the dashboard makes the data automatically refresh every 30 seconds.
- **Loading/error states:** `isLoading`, `isError`, `error` are computed automatically.
- **Stale time:** `staleTime: 60 * 1000` means cached data is considered fresh for 60 seconds — navigating back to a page does not re-fetch immediately.

**How it is used here:** The `ReactQueryProvider` in `src/components/providers.tsx` wraps the entire app (in the root layout). Every page that fetches data uses `useQuery`. Mutations (creating or updating records) use `useMutation` and call `queryClient.invalidateQueries` to tell React Query to re-fetch affected data.

---

### react-hook-form + Zod

**What they are:** A pair of libraries for building and validating forms.

- **react-hook-form** manages form state (values, touched state, submission) with minimal re-renders.
- **Zod** defines validation schemas: rules about what shapes of data are valid. For example: "this field must be a string, at least 1 character, not empty."
- **@hookform/resolvers** is the bridge that connects Zod schemas to react-hook-form.

**Why this combination:** Forms in React are traditionally verbose. react-hook-form reduces boilerplate dramatically. Zod schemas can be shared between the frontend form and the backend API route — you define the rules once and validate in both places. The API routes in this project all use Zod to validate incoming request bodies (e.g., `createFaturaSchema.parse(body)`), which means malformed requests are rejected with clear error messages before they ever reach the database.

---

### @dnd-kit

**What it is:** A drag-and-drop library for React. Used on the kanban board at `/kanban`.

**Why not a simpler alternative:** `@dnd-kit` is the modern, accessibility-first choice. It handles keyboard navigation, screen readers, and touch screens correctly. The older `react-beautiful-dnd` library is no longer maintained.

**How it is used here:** The kanban board renders fatura cards in columns by status. Workers drag cards between columns (e.g., from `EM_REVISAO` to `APROVADO`). On drop, a `PATCH /api/faturas/:id` request updates the status in the database.

---

### xlsx

**What it is:** A library for reading and writing Excel files (`.xlsx`, `.xls`, `.csv`).

**Why it is used:** The product catalog can contain thousands of SKUs. Re-entering them manually into a web form would be impractical. The Produtos page allows uploading an Excel file; the app parses it with `xlsx` and sends the rows to `POST /api/produtos` as a bulk array, which the API inserts in a single database transaction using `prisma.$transaction`.

---

### lucide-react

**What it is:** A React icon library with consistent, clean SVG icons. Icons used in this project include `FileText` (faturas), `Package` (products), `Kanban` (kanban board), `Truck` (operacional), `LogOut` (sign out button), and many others in the dashboard.

**Why not another icon library:** lucide-react has a large set of icons, is tree-shakeable (only icons you import are included in the final bundle), and its icon components are simple React components that accept `className` and `size` props.

---

### date-fns

**What it is:** A utility library for date formatting and manipulation.

**Why it is used:** JavaScript's built-in `Date` object formatting is limited and inconsistent. date-fns provides functions like `format(date, 'dd/MM/yyyy HH:mm')` and supports locales. The `ptBR` locale is imported so dates display in Portuguese (e.g., "segunda-feira, 9 de março de 2026").

---

### Pino

**What it is:** A structured logging library. Instead of `console.log("Fatura created")`, Pino outputs:

```json
{"level":30,"time":1741478400000,"msg":"Fatura created","faturaId":"clx4abc123"}
```

**Why structured logging matters:** In production, logs are ingested by systems like Loki, Datadog, or CloudWatch. Those systems need to query logs (e.g., "show all errors for faturaId X"). `console.log` outputs plain text — you cannot query it. Pino outputs JSON — every field is queryable.

**How it is configured here:** In development, `pino-pretty` is used as a transport — it formats the JSON into human-readable colored output in your terminal. In production, raw JSON is emitted, which log aggregation systems consume.

---

### Docker and docker-compose

Covered in detail in [Section 12](#12-docker--what-it-is-and-how-it-is-used-here).

---

### n8n

**What it is:** n8n is a no-code/low-code workflow automation tool. Think of it as a visual programming environment where you connect nodes (HTTP request, OCR, database lookup, etc.) with arrows to build automated pipelines.

**Why n8n for OCR instead of calling an OCR API directly from the app:**
- **Decoupling:** The app does not care which OCR provider is used — Google Vision, AWS Textract, Azure Computer Vision, a self-hosted Tesseract instance. You can swap the OCR provider by changing the n8n workflow, with zero code changes in the app.
- **Resilience:** n8n can retry failed OCR calls, handle rate limits, and queue work, without adding complexity to the Next.js app.
- **Visibility:** The n8n UI lets non-developers see and debug the automation workflow.

**How it integrates:** The app sends a POST to the n8n webhook URL when an image is uploaded. n8n processes the image (reads its content, calls an OCR service, parses the results). n8n then POSTs the structured line-item data back to `/api/webhooks/n8n`. A shared secret (`N8N_WEBHOOK_SECRET`) is sent as the `x-webhook-secret` header to authenticate the callback.

---

## 5. Folder and File Structure

```
automarche/
├── prisma/
│   ├── schema.prisma          # Defines the database: every table, column, type, relation
│   ├── migrations/            # SQL history — every ALTER TABLE and CREATE TABLE ever run
│   └── seed.ts                # Creates the test admin user via BetterAuth's signUp API
│
├── prisma.config.ts           # Prisma CLI config: schema path, migration path, DB URL
│
├── src/
│   ├── app/                   # Everything in here is a Next.js route
│   │   │
│   │   ├── (auth)/            # Route GROUP for unauthenticated pages
│   │   │   └── login/         # The login page lives here
│   │   │       └── page.tsx   # Renders the login form
│   │   │
│   │   ├── (app)/             # Route GROUP for authenticated pages
│   │   │   ├── layout.tsx     # AUTH GUARD: checks session, redirects if logged out
│   │   │   │                  # Also renders the Sidebar wrapper
│   │   │   ├── dashboard/page.tsx    # Metrics + recent faturas
│   │   │   ├── kanban/page.tsx       # Drag-and-drop status board
│   │   │   ├── tarefas/page.tsx      # Task list and time tracking
│   │   │   ├── produtos/page.tsx     # Product catalog + Excel import
│   │   │   └── operacional/page.tsx  # Fatura list + upload + discrepancy review
│   │   │
│   │   ├── api/               # Backend API routes (all return JSON)
│   │   │   ├── auth/
│   │   │   │   └── [...betterauth]/route.ts   # BetterAuth handler (login, logout, session)
│   │   │   ├── faturas/
│   │   │   │   ├── route.ts                   # GET /api/faturas, POST /api/faturas
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts               # GET, PATCH, DELETE /api/faturas/:id
│   │   │   │       └── upload/route.ts        # POST /api/faturas/:id/upload (image)
│   │   │   ├── produtos/
│   │   │   │   ├── route.ts                   # GET /api/produtos, POST (single or bulk)
│   │   │   │   └── [id]/route.ts              # GET, PATCH, DELETE /api/produtos/:id
│   │   │   ├── tasks/
│   │   │   │   ├── route.ts                   # GET /api/tasks, POST /api/tasks
│   │   │   │   └── [id]/route.ts              # GET, PATCH, DELETE /api/tasks/:id
│   │   │   ├── metrics/route.ts               # GET /api/metrics — dashboard stats
│   │   │   ├── webhooks/
│   │   │   │   └── n8n/route.ts               # POST /api/webhooks/n8n — OCR results
│   │   │   └── seed/route.ts                  # GET /api/seed — dev-only user creation
│   │   │
│   │   ├── globals.css        # Imports Tailwind; minimal custom styles
│   │   ├── layout.tsx         # ROOT layout: sets <html lang="pt-BR">, Inter font,
│   │   │                      # wraps everything in ReactQueryProvider
│   │   └── page.tsx           # Root page (redirects to /dashboard)
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   └── Sidebar.tsx    # Collapsible dark sidebar with nav links and user info
│   │   ├── providers.tsx      # ReactQueryProvider (QueryClientProvider wrapper)
│   │   └── ui/                # Reusable, generic UI components
│   │       ├── Button.tsx     # Styled button (variants: primary, secondary, danger)
│   │       ├── Input.tsx      # Styled text input with label and error state
│   │       ├── MetricCard.tsx # Dashboard stat card with icon, value, trend arrow
│   │       ├── Modal.tsx      # Generic modal dialog (overlay + content)
│   │       ├── Select.tsx     # Styled select / dropdown
│   │       ├── StatusBadge.tsx # Colored pill badge for fatura/task status
│   │       └── Table.tsx      # Generic sortable data table
│   │
│   ├── lib/
│   │   ├── auth.ts            # BetterAuth server config (Prisma adapter, session TTL)
│   │   ├── auth-client.ts     # BetterAuth browser client (signIn, signOut, useSession)
│   │   ├── db.ts              # Prisma singleton with PrismaPg driver adapter
│   │   └── logger.ts          # Pino logger (pretty in dev, JSON in prod)
│   │
│   └── types/
│       └── index.ts           # TypeScript interfaces for API responses and UI props
│
├── .env                       # Local secrets (NOT committed to git)
├── .env.example               # Template showing required variables (safe to commit)
├── Dockerfile                 # Multi-stage Docker build for production image
├── docker-compose.yml         # Local dev stack: app + postgres + n8n
├── next.config.ts             # Next.js config (standalone output, upload size limit)
├── prisma.config.ts           # Prisma CLI config (schema path, migration path, DB URL)
├── package.json               # Dependencies and npm scripts
└── tsconfig.json              # TypeScript compiler options
```

### What Are Route Groups?

The `(auth)` and `(app)` folders in parentheses are Next.js **route groups**. The parentheses tell Next.js to ignore this part of the folder name when computing the URL. So:

- `src/app/(auth)/login/page.tsx` → URL is `/login` (not `/auth/login`)
- `src/app/(app)/dashboard/page.tsx` → URL is `/dashboard` (not `/app/dashboard`)

The power of route groups is **shared layouts**. Each group can have its own `layout.tsx`. The `(app)/layout.tsx` contains the authentication guard and the sidebar — so every page under `(app)/` automatically gets the sidebar and is protected by the auth check. The `(auth)/` pages get none of that.

### The `@` Alias

Throughout the code you will see imports like `import { prisma } from "@/lib/db"`. The `@` maps to `src/` — this is configured in `tsconfig.json`. It avoids relative import chains like `../../../lib/db`.

---

## 6. Database Schema

The schema is defined in `prisma/schema.prisma`. This section explains every model, why it exists, and how models relate.

### User

Managed entirely by BetterAuth. Fields: `id` (string, not auto-increment — BetterAuth generates IDs), `name`, `email`, `emailVerified`, `image`, `role`, `createdAt`, `updatedAt`.

Relations: A user can own many `Fatura` records, create many `Task` records, be assigned to many `Task` records, and have many `TaskTimeEntry` records.

The `role` field (`"user"` by default) is available for future role-based access control (e.g., restricting who can approve faturas).

### Session, Account, Verification

These are BetterAuth's internal tables. You do not interact with them directly.

- `Session` — active login sessions. Each row represents a browser that is currently logged in. Columns: `token` (the cookie value), `expiresAt`, `userId`.
- `Account` — authentication providers. Email+password login stores the hashed password here in the `password` column.
- `Verification` — used for email verification flows (not currently active in this project but required by BetterAuth's schema).

### Fatura

The central model. Represents one paper invoice from a supplier.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | String (cuid) | Unique identifier, auto-generated |
| `number` | String (unique) | The invoice number printed on the paper |
| `supplier` | String? | Supplier name |
| `status` | FaturaStatus enum | Workflow stage (see enums below) |
| `imageUrl` | String? | Path to the uploaded photo, e.g. `/uploads/fatura-abc-123456789.jpg` |
| `ocrData` | Json? | Raw OCR output stored as-is (useful for debugging) |
| `totalInvoice` | Decimal? | Total value extracted from the invoice |
| `totalScanned` | Decimal? | Total value of scanned items |
| `notes` | String? | Free-text notes from the worker |
| `receivedAt` | DateTime? | When the delivery physically arrived |
| `userId` | String | Foreign key to the User who registered this fatura |

Relations: has many `FaturaItem`, `ScanItem`, `Discrepancy`, and `Task` records.

### FaturaItem

One line item from the invoice, as extracted by OCR.

| Column | Purpose |
|--------|---------|
| `faturaId` | Which fatura this item belongs to |
| `produtoId` | Optional link to the Produto catalog (matched by product code) |
| `productCode` | Raw code from OCR (may not match catalog) |
| `productName` | Raw name from OCR |
| `quantity` | Quantity stated on invoice (Decimal with 3 decimal places) |
| `unitPrice` | Price per unit |
| `total` | Line total (quantity x unitPrice) |

### ScanItem

One line item from the barcode scanner. Same shape as FaturaItem but without price fields (the scanner only records what was physically received, not prices).

### Discrepancy

A computed record representing a mismatch between the invoice and the scan. Created automatically by the n8n webhook handler.

| Column | Purpose |
|--------|---------|
| `faturaId` | Which fatura |
| `productCode` | Product identifier |
| `productName` | Product name |
| `invoiceQty` | Quantity from invoice |
| `scannedQty` | Quantity from scanner |
| `difference` | `invoiceQty - scannedQty` (negative means more was scanned than invoiced) |
| `status` | DiscrepancyStatus: PENDENTE, RESOLVIDO, IGNORADO |
| `notes` | Explanation for how the discrepancy was resolved |

### Produto

The product catalog. Each product has a `code` (barcode or SKU, unique), `name`, `unit` (e.g., "UN", "KG", "CX"), optional `price` and `category`, and an `active` flag.

Products can be imported from Excel in bulk. The `POST /api/produtos` endpoint accepts either a single object or an array. Bulk imports use `prisma.produto.upsert` — if a product with that code already exists, it updates it; otherwise it creates it.

### Task

A work item associated with reviewing or resolving a fatura.

| Column | Purpose |
|--------|---------|
| `title` | Short task description |
| `description` | Longer details |
| `status` | TaskStatus: TODO, IN_PROGRESS, DONE, BLOCKED |
| `shift` | Shift: MANHA, TARDE, NOITE — for scheduling |
| `priority` | Integer; higher = more urgent. Used for ordering in queries |
| `dueDate` | Optional deadline |
| `startedAt` / `completedAt` | Timestamps for when the task was started and finished |
| `faturaId` | Optional link to a specific fatura |
| `createdById` | Who created the task |
| `assignedToId` | Who is responsible for it |

### TaskTimeEntry

Timer records for tasks. Workers can start/stop a timer on a task to track time spent. Each entry has `startTime`, optional `endTime`, and computed `duration` in seconds.

### Enums

Enums are fixed sets of allowed string values:

```
FaturaStatus:      PENDENTE -> PROCESSANDO -> EM_REVISAO or APROVADO or REJEITADO
TaskStatus:        TODO -> IN_PROGRESS -> DONE (or BLOCKED at any point)
Shift:             MANHA | TARDE | NOITE
DiscrepancyStatus: PENDENTE | RESOLVIDO | IGNORADO
```

---

## 7. Authentication Flow

### How BetterAuth Works

1. The user visits `/login` and submits their email and password.
2. The login form calls `authClient.signIn.email({ email, password })` from `src/lib/auth-client.ts`.
3. BetterAuth sends a `POST /api/auth/sign-in/email` request to the server.
4. The BetterAuth handler (`/api/auth/[...betterauth]/route.ts`) verifies the password against the hashed value stored in the `Account` table.
5. On success, BetterAuth creates a `Session` row in the database and sets a session cookie in the browser response.
6. The browser stores the cookie. On every subsequent request to the app or API, the browser automatically sends this cookie.

### How the Auth Guard Works

Every page under `(app)/` goes through `src/app/(app)/layout.tsx`:

```typescript
const session = await auth.api.getSession({
  headers: await headers(),
});

if (!session) {
  redirect("/login");
}
```

`auth.api.getSession` reads the session cookie from the request headers, looks up the `Session` row in the database, and returns the associated user. If no valid session exists (cookie missing, expired, or the row was deleted on sign-out), the user is redirected to `/login`.

This check happens **on the server**, before any HTML is sent to the browser. A user who is not logged in will never even receive the dashboard HTML — they get an HTTP redirect instead.

### API Route Authentication

Every API route also calls `auth.api.getSession`. If a request arrives without a valid session cookie (e.g., someone tries to hit the API from Postman without being logged in), they receive `401 Unauthorized`. There is no public API — all endpoints require authentication except the BetterAuth endpoints and the n8n webhook (which uses a separate shared secret).

### Sessions Last 7 Days

`session.expiresIn` is set to `60 * 60 * 24 * 7` (7 days in seconds). `session.updateAge` is `60 * 60 * 24` (1 day) — this means if you use the app within the last day before expiry, your session is automatically extended.

---

## 8. The n8n OCR Flow — Step by Step

This describes exactly what happens from the moment a worker uploads a fatura photo to the moment discrepancies appear on screen.

**Step 1 — Worker registers the fatura**

The worker opens `/operacional` and clicks "Nova Fatura". They fill in the invoice number and supplier name. This calls `POST /api/faturas`, which creates a `Fatura` row with `status: PENDENTE`.

**Step 2 — Worker uploads the invoice photo**

The worker clicks "Upload Imagem" on the fatura row and selects a photo from their device. The frontend sends a `POST /api/faturas/:id/upload` request with the file as `multipart/form-data`.

**Step 3 — Image is saved**

The upload handler:
1. Validates the file type (JPG, PNG, WebP, GIF, or PDF).
2. Saves the file to `/public/uploads/fatura-{id}-{timestamp}.{ext}` on the server's filesystem.
3. Updates the `Fatura` row: sets `imageUrl` to `/uploads/fatura-...` and changes `status` to `PROCESSANDO`.

**Step 4 — n8n is notified (fire-and-forget)**

The upload handler immediately fires a POST request to the n8n webhook URL (`N8N_WEBHOOK_URL` env variable) and does **not** wait for the response. This is called "fire-and-forget." The response to the worker's browser does not depend on OCR completing.

The POST body sent to n8n contains:
```json
{
  "faturaId": "clx4abc123",
  "faturaNumber": "NF-001234",
  "imageUrl": "http://localhost:3000/uploads/fatura-clx4abc123-1741478400000.jpg",
  "callbackUrl": "http://localhost:3000/api/webhooks/n8n"
}
```

It also includes the `x-webhook-secret` header for authentication.

**Step 5 — n8n processes the image**

n8n receives the webhook, downloads the image from `imageUrl`, sends it to an OCR service, and parses the returned text into structured line items (product code, product name, quantity, unit price, total).

The n8n workflow is configured separately in the n8n UI (accessible at `http://localhost:5678`). The app does not dictate the OCR implementation — this is the decoupling benefit mentioned earlier.

**Step 6 — n8n sends results back**

n8n sends a POST to the `callbackUrl` (`/api/webhooks/n8n`) with:
```json
{
  "faturaId": "clx4abc123",
  "items": [
    { "productCode": "7891234567890", "productName": "Azeite 500ml", "quantity": 48, "unitPrice": 12.50, "total": 600.00 },
    { "productCode": "7891234567891", "productName": "Arroz 5kg", "quantity": 100, "unitPrice": 8.90, "total": 890.00 }
  ],
  "ocrData": { "rawText": "..." },
  "totalInvoice": 1490.00
}
```

The request includes the `x-webhook-secret` header for authentication.

**Step 7 — Discrepancies are computed**

The webhook handler (`src/app/api/webhooks/n8n/route.ts`):
1. Validates the secret.
2. Validates the payload shape with Zod.
3. Loads the fatura from the database, including its `scanItems`.
4. Deletes any previously stored `FaturaItem` and `Discrepancy` records for this fatura.
5. Creates new `FaturaItem` rows from the OCR data.
6. Builds two maps: `invoiceMap` (product code to total quantity from invoice) and `scanMap` (product code to total quantity from scanner).
7. Finds all product codes that appear in either map.
8. For each product, computes `difference = invoiceQty - scannedQty`.
9. If the absolute difference is greater than 0.001, creates a `Discrepancy` row.
10. Updates the fatura: if any discrepancies exist, sets `status = EM_REVISAO`; otherwise sets `status = APROVADO`.

**Step 8 — Worker sees the result**

The dashboard and operacional page use `refetchInterval: 30000` with React Query. Within 30 seconds (at most), the worker's browser re-fetches and displays the updated status. They can open the fatura to see the discrepancy table.

---

## 9. API Routes Reference

All routes require a valid session cookie (BetterAuth) unless noted.

### Faturas

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/faturas` | List faturas. Query params: `page`, `pageSize`, `status`, `search` |
| `POST` | `/api/faturas` | Create a new fatura. Body: `{ number, supplier?, notes?, receivedAt? }` |
| `GET` | `/api/faturas/:id` | Get one fatura with all related items, scanItems, discrepancies, tasks |
| `PATCH` | `/api/faturas/:id` | Update fatura fields: `status`, `supplier`, `notes`, `imageUrl`, `totalInvoice`, `totalScanned` |
| `DELETE` | `/api/faturas/:id` | Delete a fatura and all related records (cascade) |
| `POST` | `/api/faturas/:id/upload` | Upload an invoice image. Body: `multipart/form-data` with `file` field |

### Produtos

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/produtos` | List products. Query params: `page`, `pageSize`, `search`, `active` |
| `POST` | `/api/produtos` | Create one product (object body) or bulk import (array body) |
| `GET` | `/api/produtos/:id` | Get one product |
| `PATCH` | `/api/produtos/:id` | Update product fields |
| `DELETE` | `/api/produtos/:id` | Delete a product |

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tasks` | List tasks. Query params: `status`, `shift`, `assignedToId`, `date`, `faturaId` |
| `POST` | `/api/tasks` | Create a task. Body: `{ title, description?, status?, shift?, priority?, dueDate?, faturaId?, assignedToId? }` |
| `GET` | `/api/tasks/:id` | Get one task with time entries |
| `PATCH` | `/api/tasks/:id` | Update task (used by kanban drag-and-drop to update status) |
| `DELETE` | `/api/tasks/:id` | Delete a task |

### Metrics

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/metrics` | Dashboard stats: total faturas, awaiting review, approved today/yesterday, total products, faturas this month vs last month, breakdown by status |

### Webhooks

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/api/webhooks/n8n` | Receive OCR results from n8n. Header: `x-webhook-secret` | Shared secret (not session cookie) |

### Auth

| Method | Path | Description |
|--------|------|-------------|
| `*` | `/api/auth/*` | All BetterAuth endpoints: sign-in, sign-out, session, etc. |

### Development Only

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/seed` | Creates the test admin user. Blocked in production with 403. |

---

## 10. Environment Variables

Copy `.env.example` to `.env` and fill in the values.

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/automarche"
BETTER_AUTH_SECRET="your-secret-key-at-least-32-chars-long"
BETTER_AUTH_URL="http://localhost:3000"
N8N_WEBHOOK_SECRET="your-n8n-webhook-secret"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### Explanation of Each Variable

**`DATABASE_URL`**
The PostgreSQL connection string. Format: `postgresql://USER:PASSWORD@HOST:PORT/DATABASE`.

- When running locally without Docker: `postgresql://postgres:password@localhost:5432/automarche`
- When running inside Docker Compose (app container talking to postgres container): `postgresql://postgres:password@postgres:5432/automarche` — note `postgres` is the Docker Compose service name, which Docker's internal DNS resolves to the postgres container's IP.

**`BETTER_AUTH_SECRET`**
A random secret string used to sign session tokens. Must be at least 32 characters. If this value changes, all existing sessions become invalid and every user will be logged out. Generate a good one with: `openssl rand -base64 32`

**`BETTER_AUTH_URL`**
The public URL of the application. BetterAuth uses this to set correct CORS headers and to validate the origin of requests. In production this would be `https://automarche.example.com`.

**`N8N_WEBHOOK_SECRET`**
A shared secret between the app and n8n. When the app sends a webhook to n8n, it includes this in the `x-webhook-secret` header. When n8n calls back to `/api/webhooks/n8n`, it must also include this secret. The webhook handler rejects requests with a wrong or missing secret. This prevents anyone on the internet from injecting fake OCR results.

**`NEXT_PUBLIC_APP_URL`**
The public URL of the application as seen from the browser. Variables prefixed with `NEXT_PUBLIC_` are embedded into the JavaScript bundle and available on the client side. Used by `auth-client.ts` to know which server to talk to for auth. Also used to construct the full image URL sent to n8n (so n8n can download the image: `http://localhost:3000/uploads/fatura-...`).

**Variables set only in `docker-compose.yml`:**

**`N8N_WEBHOOK_URL`**
The URL the app uses to trigger n8n. Inside Docker Compose, this is `http://n8n:5678/webhook/fatura-ocr` — the `n8n` hostname is resolved by Docker's internal DNS to the n8n service container.

---

## 11. Local Development Setup — From Zero

This guide assumes you have nothing installed except a terminal.

### Prerequisites

Install these tools:

1. **Node.js 20+** — https://nodejs.org (download the LTS version)
   - Verify: `node --version` (should show `v20.x.x` or higher)
2. **Docker Desktop** — https://www.docker.com/products/docker-desktop
   - Verify: `docker --version`
3. **Git** — https://git-scm.com (usually pre-installed on macOS/Linux)

### Option A: Run Everything in Docker (Recommended for First Run)

This starts the app, database, and n8n together with one command. You do not need Node.js installed for this option.

```bash
# 1. Clone the repository
git clone <repository-url>
cd automarche

# 2. Create the environment file
cp .env.example .env
# The defaults work for local dev — edit only if you want different secrets

# 3. Start all services
docker compose up --build

# 4. In a separate terminal, run the database migrations
docker compose exec app npx prisma migrate deploy

# 5. Create the test user — open your browser and visit:
#   http://localhost:3000/api/seed
# You should see: {"ok":true,"message":"Test user created","email":"admin@automarche.com"}

# 6. Open the app
#   http://localhost:3000
# Login: admin@automarche.com / admin123
```

Services will be available at:
- App: http://localhost:3000
- n8n: http://localhost:5678 (login: admin / changeme)
- PostgreSQL: localhost:5432 (user: postgres, password: password, db: automarche)

To stop: `docker compose down`
To stop and delete all data including the database: `docker compose down -v`

### Option B: Run the App Locally, Database in Docker

This is better for active development — the app runs directly on your machine so file changes take effect immediately without rebuilding the Docker image.

```bash
# 1. Clone and enter the project
git clone <repository-url>
cd automarche

# 2. Install Node.js dependencies
npm install

# 3. Start only the database (and n8n if needed)
docker compose up postgres n8n -d

# 4. Create the environment file
cp .env.example .env
# The default DATABASE_URL points to localhost:5432, which is correct for this option.

# 5. Run database migrations
npx prisma migrate dev

# 6. Create the test user (run once)
npm run seed

# 7. Start the Next.js development server
npm run dev

# App is now at http://localhost:3000
# Login: admin@automarche.com / admin123
```

### npm Scripts Reference

| Script | What it does |
|--------|--------------|
| `npm run dev` | Start Next.js in development mode (hot-reload enabled) |
| `npm run build` | Compile the app for production |
| `npm run start` | Run the production build (requires `npm run build` first) |
| `npm run lint` | Run ESLint to check for code issues |
| `npm run seed` | Run `prisma/seed.ts` to create the test admin user |

### Prisma Commands Reference

| Command | What it does |
|---------|--------------|
| `npx prisma migrate dev` | Apply pending migrations AND create new ones if schema changed |
| `npx prisma migrate deploy` | Apply pending migrations only (used in production/Docker) |
| `npx prisma db push` | Push schema changes directly to the database WITHOUT creating migration files (quick for experimenting, do not use on shared databases) |
| `npx prisma generate` | Re-generate TypeScript types from the schema (run after editing `schema.prisma`) |
| `npx prisma studio` | Open a visual database browser at http://localhost:5555 |

---

## 12. Docker — What It Is and How It Is Used Here

### What Is Docker?

A computer program normally depends on many things: a specific version of Node.js, certain system libraries, a particular operating system configuration. If your machine has a different setup than the production server, the app may behave differently or fail to start.

Docker solves this by packaging an application together with everything it needs into a **container** — an isolated, self-contained unit that runs identically on any machine with Docker installed. Think of it as a lightweight virtual machine that starts in seconds.

A **Docker image** is a blueprint (a frozen snapshot). A **container** is a running instance of an image.

### What Is docker-compose?

docker-compose is a tool for defining and running multiple containers together. Instead of starting a database container, a network, and an app container manually with separate `docker run` commands, you describe everything in a `docker-compose.yml` file and run `docker compose up`.

### The `docker-compose.yml` in This Project

Three services are defined:

**postgres**

```yaml
image: postgres:16-alpine
```

Runs PostgreSQL 16 in a container. "alpine" means it uses Alpine Linux — a minimal Linux distribution that results in a smaller image. The database data is stored in a Docker volume (`postgres_data`) that persists across container restarts. Running `docker compose down` leaves data intact. Running `docker compose down -v` deletes the volume and wipes the database.

A `healthcheck` is configured: Docker periodically runs `pg_isready` inside the postgres container to verify it is accepting connections. The `app` service declares `depends_on: postgres: condition: service_healthy` — it will not start until postgres passes its health check, preventing connection errors during startup.

**app**

```yaml
build: { context: ., dockerfile: Dockerfile }
```

Builds and runs the Next.js application from the local `Dockerfile`. The `uploads_data` volume mounts to `/app/public/uploads` so uploaded invoice images persist across container restarts. Environment variables (including `DATABASE_URL` using `postgres` as the hostname) are set directly in `docker-compose.yml`.

**n8n**

```yaml
image: n8nio/n8n:latest
```

Runs the n8n automation server. n8n workflows are stored in the `n8n_data` volume. The n8n web UI is accessible at http://localhost:5678 with basic auth (admin / changeme by default, overridden by the `N8N_PASSWORD` environment variable).

### The Dockerfile (Multi-Stage Build)

The `Dockerfile` uses a **multi-stage build** — a technique to keep the final production image small.

**Stage 1: deps**
Starts from `node:20-alpine`. Copies only `package.json` and `package-lock.json`, then runs `npm ci` to download all dependencies. This stage exists so Docker can cache the dependency layer — if only source files change (not `package.json`), Docker reuses this cached layer on the next build, making builds much faster.

**Stage 2: builder**
Copies source code and the `node_modules` from stage 1. Runs `npx prisma generate` (to build the Prisma client from the schema) and `npm run build` (to compile Next.js into a production bundle). `NEXT_TELEMETRY_DISABLED=1` prevents Next.js from sending analytics during the build.

**Stage 3: runner**
The final image. Starts from a fresh `node:20-alpine` and copies only the compiled output from the builder stage — not the source code, not the development dependencies. This results in a much smaller image. Creates a non-root user (`nextjs`) for security best practices. Exposes port 3000 and runs `node server.js` (the Next.js standalone server).

### Useful Docker Commands

```bash
# Start all services in the background
docker compose up -d

# Start and rebuild the app image (required after code changes)
docker compose up --build

# View live logs for all services
docker compose logs -f

# View logs for only the app
docker compose logs -f app

# Run a command inside the running app container
docker compose exec app npx prisma migrate deploy
docker compose exec app npx prisma studio

# Run a one-off command in a new container
docker compose run --rm app npm run seed

# Stop all services
docker compose down

# Stop all services and delete volumes (WIPES THE DATABASE)
docker compose down -v

# See running containers and their status
docker compose ps
```

---

## 13. Future Deployment — Kubernetes Direction

The current Docker Compose setup is suitable for a single-server deployment. The long-term direction is Kubernetes.

### What Is Kubernetes?

Kubernetes (K8s) is an orchestration system for containers. Where Docker Compose runs containers on one machine, Kubernetes runs them across a cluster of machines and handles:
- Automatic restarts if a container crashes
- Rolling deployments with zero downtime
- Horizontal scaling (run multiple replicas of the app)
- Ingress routing (directing traffic to the right service)

### Planned Stack

- **Kubernetes manifests** — YAML files defining Deployments, Services, Ingress, ConfigMaps, and Secrets for each component.
- **ArgoCD** — a GitOps tool that watches a Git repository for changes to K8s manifests and automatically applies them to the cluster. Deploying a new version is as simple as updating the image tag in a YAML file and pushing to Git.
- **Traefik** — an ingress controller that handles HTTPS termination, routing, and Let's Encrypt certificate management.

The `output: "standalone"` setting in `next.config.ts` is already in place for Kubernetes deployment — the standalone output produces a self-contained `server.js` and minimal `node_modules`, optimized for container deployment.

---

## 14. Common Issues and Troubleshooting

### PrismaClientInitializationError or Adapter-Related Error on Startup

**Symptom:** The app crashes on startup with an error mentioning the driver adapter or "Cannot read properties of undefined."

**Cause:** You may be following a tutorial or configuration from Prisma v5/v6 that puts the `DATABASE_URL` in `schema.prisma`'s datasource block. In Prisma v7, the connection string must NOT be in `schema.prisma`. The datasource block has no `url` field. The connection is established in code via `PrismaPg`.

**Fix:** Ensure `src/lib/db.ts` matches:
```typescript
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const client = new PrismaClient({ adapter });
```
And that `prisma/schema.prisma` has no `url = env("DATABASE_URL")` line inside the datasource block.

---

### "Environment variable not found: DATABASE_URL" During `prisma migrate`

**Cause:** The Prisma CLI reads the database URL from `prisma.config.ts`, which uses `dotenv/config` to load `.env`. If `.env` does not exist, the variable is undefined.

**Fix:** Ensure `.env` exists and contains `DATABASE_URL`. Copy from `.env.example`:
```bash
cp .env.example .env
```

---

### Tables Not Showing in DBeaver (or Another Database Client)

**Cause A:** Migrations have not been run. Tables are only created by running `npx prisma migrate dev` or `npx prisma migrate deploy`. A freshly created PostgreSQL database is empty.

**Fix:** Run `npx prisma migrate dev` (local development) or `npx prisma migrate deploy` (Docker/production).

**Cause B:** You are looking at the wrong schema. PostgreSQL uses schemas (namespaces). By default, Prisma creates tables in the `public` schema. In DBeaver, expand: your connection → Databases → automarche → Schemas → public → Tables.

---

### `npx prisma db push` vs `npx prisma migrate dev` — When to Use Which

- **`db push`** directly alters the database schema to match `schema.prisma` without creating migration files. Use this only for rapid prototyping on your own local database. Never use it on a shared database or in production — it can silently delete columns that were removed from the schema, and it leaves no history of changes.
- **`migrate dev`** creates a SQL migration file in `prisma/migrations/`, applies it to the database, and re-generates the Prisma client. This is the correct workflow for any change that needs to be tracked, reviewed, and reproducible.

---

### Login Fails After Running the Seed

**Symptom:** The seed reports success but login with `admin@automarche.com` / `admin123` fails.

**Cause:** The seed creates the user via BetterAuth's `signUpEmail` API, which stores the password hashed in the `Account` table. If migrations have not been run, the `Account` table does not exist and the seed silently fails.

**Fix:**
1. Confirm migrations have run: `npx prisma migrate dev`
2. Check the `Account` table has a row: `npx prisma studio`
3. If the environment is dirty, wipe it and start fresh:
   ```bash
   docker compose down -v
   docker compose up --build
   docker compose exec app npx prisma migrate deploy
   # then visit http://localhost:3000/api/seed
   ```

---

### "Too Many Connections" Error from PostgreSQL

**Symptom:** Errors like `sorry, too many clients already` in the app logs.

**Cause:** Multiple `PrismaClient` instances are being created — the singleton is not working.

**Fix:** Verify `src/lib/db.ts` uses the `globalThis` singleton pattern. Confirm the file reads:
```typescript
export const prisma = globalForPrisma.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```
This is already the case in the codebase. If you added new Prisma client instantiations elsewhere (e.g., in a script), those would bypass the singleton.

---

### n8n Webhook Not Triggering

**Symptom:** You upload an image, the status goes to `PROCESSANDO`, but it never changes to `EM_REVISAO` or `APROVADO`.

**Debug steps:**
1. Check that `N8N_WEBHOOK_URL` is set. In Docker Compose it should be `http://n8n:5678/webhook/fatura-ocr`.
2. Open n8n at http://localhost:5678 and verify the workflow exists and is **active** (toggle in the top right of the workflow editor).
3. Check app logs for the message `Failed to trigger n8n webhook` — if present, the outbound POST from the app to n8n failed.
4. Check n8n's execution history inside the n8n UI for any failed executions and their error messages.

---

### The `/api/seed` Endpoint Must Be Removed Before Real Production Deployment

The `/api/seed` endpoint creates a user with a known, hardcoded password. It is blocked when `NODE_ENV=production`:

```typescript
if (process.env.NODE_ENV === "production") {
  return NextResponse.json({ error: "Not available in production" }, { status: 403 });
}
```

The Docker build sets `NODE_ENV=production`, so this guard is active in Docker. However, before deploying to any environment accessible from the internet, delete `src/app/api/seed/route.ts` entirely. Do not rely on the environment variable check alone.

---

### Uploaded Images Disappear After Container Restart

**Symptom:** Uploaded fatura images are no longer accessible after restarting Docker services.

**Cause:** If the uploads directory is not backed by a persistent volume, files are lost when the container stops.

**Fix:** Ensure the `uploads_data` volume is mounted in `docker-compose.yml`:
```yaml
services:
  app:
    volumes:
      - uploads_data:/app/public/uploads

volumes:
  uploads_data:
```
This is already configured in the project. Files will persist as long as you do not run `docker compose down -v`.
