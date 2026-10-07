<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Project rules

- Homepage exchange styling uses scoped semantic market tokens and its own heading font token; shared navigation uses equal outer grid tracks — why: the exchange restyle stays isolated while the menu remains centered independently of the logo and account actions.

- KYC, tax refund, support, adjustment and staff rules live in `src/lib/AGENTS.md` — why: keeps root notes small.
- Data lives in the user's own Postgres via `DATABASE_URL` (`src/lib/db.server.ts`); schema is created/extended idempotently in `setup()` — why: no Lovable Cloud, the user owns the database.
- Auth is custom cookie sessions (`bank_sessions`); protected server fns call `requireUserId`/`requireAdminId` from `src/lib/session.server.ts` — why: every endpoint must check the session itself.
- 2-step sign-in uses emailed 6-digit codes (`bank_login_codes`); phone numbers are stored but not verified — why: no SMS provider configured.
- Internal transfers go through `sendMoney` in `src/lib/banking.functions.ts`: one DB transaction, both accounts locked `for update` in id order, idempotency key per user — why: prevents double-spend and duplicate sends.
- Virtual cards (`bank_cards`, `src/lib/cards.functions.ts`) are fictional test-range numbers; the fee is debited from a USD account in the same DB transaction that creates the card, with a per-request idempotency key — why: card must never exist without a server-side charge.
- External transfers (local/wire) post as pending ledger txns to SYSTEM:EXTERNAL:<cur> with recipient details in `bank_ledger_txns.details`; admins complete/cancel via adminSettlePending — why: no real payment rail, money is reserved until an admin confirms.
- Loan requests live in `bank_loan_requests` (`src/lib/loans.functions.ts`); customers submit/cancel, admin approval (`adminDecideLoan`) sets APR, computes the amortized payment and disburses from SYSTEM:LOANS:<cur> into the customer's account in one DB transaction — why: no money moves without review, and the ledger stays balanced.
- Emailed statements: PDF is built in the browser and sent via `emailStatement`, which only mails the signed-in user's own address — why: the server runtime can't reliably run the PDF library, and recipients can't be chosen.
- Only USD is offered: currency lists, account opening, loans, beneficiaries and signup are USD-only and /convert redirects to /send — why: owner chose a single-currency bank.
- Admin control area is a tabbed console (`src/components/AdminConsole.tsx`) backed by `src/lib/admin.functions.ts`; every admin fn calls `requireAdminId` and writes notify/audit in the same DB transaction — why: admin actions must be authorized server-side and traceable.
- Loan servicing (`src/lib/loans.server.ts`, `bank_loan_payments`): repayments debit the borrower's same-currency account in one DB transaction, cover daily-accrued interest (actual/365) first into SYSTEM:LOAN_INTEREST:<cur>, then principal into SYSTEM:LOANS:<cur>; schedule, next due date and overdue days are derived from the approved terms — why: balances stay exact and the ledger balanced without a scheduler.
- Standing orders (`bank_standing_orders`, `src/lib/standing-orders.*`) run due monthly internal transfers lazily when customers load the dashboard or Standing Orders page, idempotent per order+run date, auto-pausing after 3 failures — why: no scheduler is available, and runs must never double-pay.
- Admin customer deletion (`adminDeleteCustomer`) requires empty accounts, no holds/pending/open loans and typed-email confirmation; customers with ledger history are erased (PII wiped, accounts closed) instead of removed — why: ledger rows must never be deleted.
- Admin settings: one validated JSON row per category in `bank_settings` (schema in `src/lib/settings-schema.ts`, 30s server cache in `settings.server.ts`), brand images in `bank_setting_assets` via `/api/brand/$slot`; the root loader serves only the public subset, and maintenance/login/session rules are enforced server-side — why: one extensible store, secrets never reach the browser.
