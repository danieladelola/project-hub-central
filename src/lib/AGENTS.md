# KYC rules

- KYC documents are stored as bytea in `bank_kyc_documents`, max 5 MB — why: user chose to keep files in their own database.
- KYC is an application workflow (`bank_kyc_applications` + `bank_kyc_history`, logic in `src/lib/kyc.functions.ts`, shared policy in `src/lib/kyc-config.ts`); only admins move it to verified/rejected/action_required, and `bank_users.kyc_status` is a synced legacy mirror — why: manual review with audit history, no auto-approval.
- KYC files upload via `/api/kyc/upload` (magic-byte type check, 5 MB) and are served only through session-gated `/api/kyc/file/$id` with no-store headers — why: documents must never have public URLs or be cached.

- Money features (cards, send, convert, standing orders, local/wire transfers, receive) require admin-approved KYC: server fns call `requireVerifiedUserId`, pages wrap content in `KycGate` via `AccountPage requireKyc`, and standing orders of unverified users are skipped — why: no money movement before identity approval.

- Every email link uses the fixed public address `APP_URL` in `src/lib/mail.server.ts`; `notify()` also emails the customer a copy, and staff-review events call `sendAdminAlert` — why: links must point to the live site, and customers/admins must hear about every action.
- Signup requires email confirmation (`email_verified=false` + emailed token) before sign-in — why: verified contact for every customer.

# Admin services rules

- Admin tax refund approval (`adminDecideTaxRefund`, Tax refunds tab) deposits the (optionally adjusted) amount from SYSTEM:IRS:USD in the same DB transaction; customers may only claim the last 3 tax years — why: mirrors IRS refund-claim rules and keeps the ledger balanced.
- Tax refund requests (`bank_tax_refunds`) and support tickets (`bank_support_tickets` + `bank_ticket_messages`) live in `src/lib/services.functions.ts`; customers only submit/cancel/reply, admins reply/close via the Support tab (`src/components/AdminSupport.tsx`), and only the last 4 SSN digits are stored — why: requests need staff review and full SSNs must never be kept.
- Manual adjustments (`adminManualAdjustment`, Adjustments tab) post against SYSTEM:ADJUSTMENTS:<cur> and write `bank_adjustments` + audit in the same DB transaction, with a required internal reason and idempotency key; corrections are new opposite entries, never edits — why: ledger entries are immutable and every staff money movement must be traceable.
- Staff tools (sessions, closures, exports/reports, staff roster) live in `src/lib/staff.functions.ts`; closing an account requires zero balance, no holds/pending, and staff are `admin` rows in `bank_user_roles` (main admin from settings can't be removed) — why: final balance check and owner lockout protection.
