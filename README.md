<img width="2048" height="768" alt="ChatGPT Image Sep 6, 2026, 07_24_36 PM" src="https://github.com/user-attachments/assets/e161cf81-3a3a-476f-a95d-e70afb6fb7bc" />

# SmartBudget

A self-hosted personal & household budget manager with expense tracking, split bills (SmartPay), reports, and an AI-powered assistant. Built with TanStack Start, React, and SQLite.

## Features

### Core
- **Expense Tracking** — log transactions with categories, accounts, and tags
- **Multi-Account Support** — manage multiple bank accounts, wallets, and credit cards
- **Household Budgets** — shared budgets with multi-user households
- **Categories** — custom categories with icons and budgets
- **Tags & Filters** — tag transactions and filter by date, category, account, or amount
- **History & Search** — full transaction history with powerful search pickers

### SmartPay (Split Bills)
- **Split Transactions** — split bills with friends/household members
- **Minimal Settlements** — algorithm calculates the fewest transfers needed
- **UPI Link Generation** — tappable UPI payment links for each settlement
- **Weekly Summary** — copy a WhatsApp-friendly "hisab kitab" summary with one tap
- **Configurable Pay Links** — HTTPS wrapper for UPI links (tappable in chat apps)

### Reports & Analytics
- **Spending Reports** — daily, weekly, monthly, and yearly breakdowns
- **Category Charts** — visual breakdown of spending by category
- **Income vs Expense** — track cash flow over time
- **Net Worth** — total assets across all accounts

### Keyboard Mode
- **Keyboard Spreadsheet Mode** — navigate and edit transactions with keyboard shortcuts
- **Keyboard Dropdown** — quick-select categories/accounts via keyboard
- **Keyboard Transaction Editor** — add/edit transactions without touching the mouse

### Security
- **App Lock** — lock the app with PIN/biometric
- **Encrypted Storage** — SQLite database with encrypted fields
- **User Accounts** — multi-user support with per-user data isolation

### New (Sep 2026)
- **Reconciliation Mode** — reconcile account balances against bank statements
- **Master Admin Console** — full admin dashboard at `/admin` to manage all households, users, and SQLite databases
- **Self-Hosted REST API** — Jellyfin-style API at `/api/v1/` for external integrations
  - `POST /api/v1/auth` — authenticate users
  - `GET /api/v1/data` — fetch full budget snapshot
  - `POST /api/v1/data` — save budget snapshot
  - `GET /api/v1/homes` — list households
  - `GET /api/v1/users` — list users
  - `GET /api/v1/health` — liveness check
- **User Avatars** — profile pictures in settings
- **Pull to Refresh** — swipe-to-refresh on mobile
- **Join Home Invites** — invite members to shared households
- **AI Assistant** — budget AI chatbot (`budget-ai.cjs`)

### UI/UX
- **Mobile-First Design** — responsive, touch-friendly interface
- **Lock Screen** — secure lock screen with app protection
- **Toast Notifications** — non-intrusive feedback
- **Dark/Light Themes** — customizable appearance

## Tech Stack

- **Frontend:** React, TanStack Router, Tailwind CSS, shadcn/ui
- **Backend:** TanStack Start (SSR), SQLite (via better-sqlite3)
- **Language:** TypeScript
- **AI:** Local AI budget assistant
- **Deployment:** Docker, Bun

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone https://github.com/Kriday5262/smartbudget.git
cd smartbudget
npm i
npm run dev
```

### Docker

```sh
docker build -t smartbudget .
docker run -p 9119:9119 smartbudget
```

## API Usage

The server exposes a REST API at `http://<your-ip>:9119/api/v1/`.

```sh
# Health check
curl http://localhost:9119/api/v1/health

# Authenticate
curl -X POST http://localhost:9119/api/v1/auth \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"secret"}'

# Fetch budget data
curl -u admin:secret "http://localhost:9119/api/v1/data?homeId=myhome"
```

## Built with

- [TanStack Start](https://tanstack.com/start)
- [React](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com)
- [SQLite](https://www.sqlite.org)
