import postgres from "postgres";
// KYC schema lives in setup() below (bank_kyc_applications, bank_kyc_history).
import bcrypt from "bcryptjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlInstance: any = null;
let schemaReady: Promise<void> | null = null;

export function getSql(): any {
  if (!sqlInstance) {
    const url = process.env["DATABASE_URL"];
    if (!url) throw new Error("DATABASE_URL is not set");
    sqlInstance = postgres(url, { max: 1, connect_timeout: 10, idle_timeout: 20 });
  }
  return sqlInstance;
}

async function setup() {
  const sql = getSql();
  await sql`create table if not exists bank_users (
    id serial primary key,
    full_name text not null,
    email text not null unique,
    password_hash text not null,
    created_at timestamptz not null default now()
  )`;
  await sql`create table if not exists bank_user_roles (
    user_id int not null references bank_users(id) on delete cascade,
    role text not null,
    primary key (user_id, role)
  )`;
  await sql`create table if not exists bank_sessions (
    token text primary key,
    user_id int not null references bank_users(id) on delete cascade,
    expires_at timestamptz not null
  )`;
  await sql`alter table bank_users
    add column if not exists phone text,
    add column if not exists country text,
    add column if not exists state text,
    add column if not exists email_verified boolean not null default false,
    add column if not exists verify_token text,
    add column if not exists account_type text,
    add column if not exists pin_hash text`;
  await sql`alter table bank_users
    add column if not exists address text,
    add column if not exists date_of_birth text,
    add column if not exists two_factor_enabled boolean not null default false,
    add column if not exists reset_token text,
    add column if not exists reset_expires timestamptz,
    add column if not exists kyc_status text not null default 'unverified',
    add column if not exists kyc_note text,
    add column if not exists status text not null default 'active'`;
  await sql`alter table bank_users
    add column if not exists avatar_data bytea,
    add column if not exists avatar_mime text,
    add column if not exists avatar_updated_at timestamptz`;
  await sql`create table if not exists bank_login_codes (
    token text primary key,
    user_id int not null references bank_users(id) on delete cascade,
    code_hash text not null,
    attempts int not null default 0,
    expires_at timestamptz not null
  )`;
  await sql`create table if not exists bank_kyc_documents (
    id serial primary key,
    user_id int not null references bank_users(id) on delete cascade,
    doc_type text not null,
    file_name text not null,
    mime text not null,
    size int not null,
    data bytea not null,
    created_at timestamptz not null default now()
  )`;
  await sql`create table if not exists bank_accounts (
    id serial primary key,
    user_id int not null references bank_users(id) on delete restrict,
    account_number text not null unique,
    nickname text not null,
    account_type text not null check (account_type in ('savings','checking')),
    currency char(3) not null,
    status text not null default 'active' check (status in ('active','restricted','frozen','closed')),
    low_balance_threshold bigint not null default 0 check (low_balance_threshold >= 0),
    low_alert_active boolean not null default false,
    opened_at timestamptz not null default now(),
    closed_at timestamptz
  )`;
  await sql`create index if not exists bank_accounts_user_idx on bank_accounts(user_id)`;
  await sql`alter table bank_accounts add column if not exists open_request_key text`;
  await sql`create unique index if not exists bank_accounts_open_key_idx on bank_accounts(user_id, open_request_key)`;
  await sql`create table if not exists bank_ledger_txns (
    id bigserial primary key,
    idempotency_key text not null unique,
    reference text not null unique,
    description text not null,
    status text not null check (status in ('pending','posted','cancelled')),
    created_by int references bank_users(id),
    created_at timestamptz not null default now(),
    posted_at timestamptz
  )`;
  await sql`create table if not exists bank_ledger_entries (
    id bigserial primary key,
    txn_id bigint not null references bank_ledger_txns(id) on delete restrict,
    account_id int references bank_accounts(id) on delete restrict,
    system_account text,
    currency char(3) not null,
    amount_minor bigint not null check (amount_minor <> 0),
    created_at timestamptz not null default now(),
    check ((account_id is null) <> (system_account is null))
  )`;
  await sql`alter table bank_ledger_txns
    add column if not exists kind text,
    add column if not exists from_account_id int references bank_accounts(id),
    add column if not exists to_account_id int references bank_accounts(id),
    add column if not exists amount_minor bigint,
    add column if not exists currency char(3),
    add column if not exists memo text,
    add column if not exists details jsonb`;
  await sql`create index if not exists bank_entries_account_idx on bank_ledger_entries(account_id)`;
  await sql`create or replace function bank_entries_immutable() returns trigger language plpgsql as $$
    begin raise exception 'ledger entries are immutable'; end $$`;
  await sql`drop trigger if exists bank_entries_no_change on bank_ledger_entries`;
  await sql`create trigger bank_entries_no_change before update or delete on bank_ledger_entries
    for each row execute function bank_entries_immutable()`;
  await sql`create or replace function bank_txn_guard() returns trigger language plpgsql as $$
    begin
      if tg_op = 'DELETE' then raise exception 'ledger transactions cannot be deleted'; end if;
      if old.status = 'posted' then raise exception 'posted transactions are immutable'; end if;
      return new;
    end $$`;
  await sql`drop trigger if exists bank_txn_no_change on bank_ledger_txns`;
  await sql`create trigger bank_txn_no_change before update or delete on bank_ledger_txns
    for each row execute function bank_txn_guard()`;
  await sql`alter table bank_accounts add column if not exists is_demo boolean not null default false`;
  // Demo (fictional) funds may only move between demo accounts and SYSTEM:DEMO:*; checked at commit.
  await sql`create or replace function bank_demo_guard() returns trigger language plpgsql as $$
    begin
      if exists (select 1 from bank_ledger_entries e join bank_accounts a on a.id = e.account_id
                 where e.txn_id = new.txn_id and a.is_demo) and exists (
           select 1 from bank_ledger_entries e left join bank_accounts a on a.id = e.account_id
           where e.txn_id = new.txn_id and ((e.account_id is not null and not a.is_demo)
             or (e.system_account is not null and e.system_account not like 'SYSTEM:DEMO:%'))) then
        raise exception 'Demo account funds are fictional and cannot leave demo accounts.';
      end if;
      return null;
    end $$`;
  await sql`drop trigger if exists bank_demo_guard on bank_ledger_entries`;
  await sql`create constraint trigger bank_demo_guard after insert on bank_ledger_entries
    deferrable initially deferred for each row execute function bank_demo_guard()`;
  await sql`create table if not exists bank_holds (
    id serial primary key,
    account_id int not null references bank_accounts(id) on delete restrict,
    amount_minor bigint not null check (amount_minor > 0),
    reason text not null,
    status text not null default 'active' check (status in ('active','released')),
    created_by int references bank_users(id),
    created_at timestamptz not null default now(),
    released_at timestamptz
  )`;
  await sql`create table if not exists bank_beneficiaries (
    id serial primary key,
    user_id int not null references bank_users(id) on delete cascade,
    name text not null,
    nickname text,
    dest_type text not null check (dest_type in ('internal','local','international')),
    account_identifier text not null,
    bank_name text,
    country text,
    currency char(3),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, dest_type, account_identifier)
  )`;
  await sql`create table if not exists bank_notifications (
    id serial primary key,
    user_id int not null references bank_users(id) on delete cascade,
    kind text not null,
    title text not null,
    body text not null,
    read_at timestamptz,
    created_at timestamptz not null default now()
  )`;
  await sql`create index if not exists bank_notifications_user_idx on bank_notifications(user_id, created_at desc)`;
  await sql`create table if not exists bank_audit_log (
    id bigserial primary key,
    user_id int references bank_users(id) on delete set null,
    actor_id int references bank_users(id) on delete set null,
    action text not null,
    detail jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  )`;
  await sql`create table if not exists bank_kyc_applications (
    id serial primary key,
    user_id int not null references bank_users(id) on delete cascade,
    reference text not null unique,
    status text not null default 'in_progress' check (status in ('in_progress','submitted','under_review','action_required','verified','rejected')),
    data jsonb not null default '{}'::jsonb,
    declaration boolean not null default false,
    corrections jsonb not null default '[]'::jsonb,
    user_feedback text,
    internal_note text,
    reviewer_id int references bank_users(id) on delete set null,
    submitted_at timestamptz,
    decided_at timestamptz,
    docs_purged_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`;
  await sql`create index if not exists bank_kyc_apps_user_idx on bank_kyc_applications(user_id, created_at desc)`;
  await sql`create table if not exists bank_kyc_history (
    id bigserial primary key,
    application_id int not null references bank_kyc_applications(id) on delete cascade,
    status text not null,
    actor_id int references bank_users(id) on delete set null,
    note text,
    created_at timestamptz not null default now()
  )`;
  await sql`alter table bank_kyc_documents
    add column if not exists application_id int references bank_kyc_applications(id) on delete cascade,
    add column if not exists slot text,
    add column if not exists sha256 text`;
  await sql`create table if not exists bank_cards (
    id serial primary key,
    user_id int not null references bank_users(id) on delete cascade,
    brand text not null check (brand in ('visa','mastercard')),
    card_number text not null unique,
    cvv text not null,
    exp_month int not null,
    exp_year int not null,
    holder_name text not null,
    currency char(3) not null default 'USD',
    balance_minor bigint not null default 0,
    status text not null default 'active' check (status in ('active','frozen','deleted')),
    fee_txn_id bigint references bank_ledger_txns(id),
    request_key text,
    created_at timestamptz not null default now()
  )`;
  await sql`create table if not exists bank_loan_requests (
    id serial primary key,
    user_id int not null references bank_users(id) on delete cascade,
    loan_type text not null,
    amount_minor bigint not null check (amount_minor > 0),
    currency char(3) not null,
    term_months int not null,
    purpose text not null,
    monthly_income_minor bigint not null default 0,
    employment text not null default '',
    status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
    admin_note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`;
  await sql`create unique index if not exists bank_cards_req_idx on bank_cards(user_id, request_key)`;
  await sql`create table if not exists bank_tax_refunds (
    id serial primary key,
    user_id int not null references bank_users(id) on delete cascade,
    tax_year int not null,
    filing_status text not null,
    ssn_last4 char(4) not null,
    amount_minor bigint not null check (amount_minor > 0),
    deposit_account_id int references bank_accounts(id),
    status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
    admin_note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`;
  await sql`alter table bank_loan_requests
    add column if not exists apr_bps int,
    add column if not exists monthly_payment_minor bigint,
    add column if not exists disbursed_account_id int references bank_accounts(id),
    add column if not exists disbursed_txn_id bigint references bank_ledger_txns(id),
    add column if not exists decided_at timestamptz`;
  await sql`alter table bank_tax_refunds
    add column if not exists irs_form text not null default '1040',
    add column if not exists agi_minor bigint,
    add column if not exists withheld_minor bigint,
    add column if not exists approved_minor bigint,
    add column if not exists deposit_txn_id bigint references bank_ledger_txns(id),
    add column if not exists decided_at timestamptz`;
  // Loan servicing (repayments)
  await sql`alter table bank_loan_requests
    add column if not exists outstanding_minor bigint,
    add column if not exists paid_total_minor bigint not null default 0,
    add column if not exists paid_principal_minor bigint not null default 0,
    add column if not exists paid_interest_minor bigint not null default 0,
    add column if not exists first_due_date date,
    add column if not exists last_accrual_at timestamptz,
    add column if not exists paid_off_at timestamptz`;
  await sql`update bank_loan_requests set outstanding_minor = amount_minor, last_accrual_at = coalesce(decided_at, updated_at),
      first_due_date = (coalesce(decided_at, updated_at) + interval '1 month')::date
    where status = 'approved' and outstanding_minor is null`;
  await sql`create table if not exists bank_loan_payments (
    id serial primary key,
    loan_id int not null references bank_loan_requests(id) on delete restrict,
    txn_id bigint not null references bank_ledger_txns(id),
    reference text not null,
    account_id int references bank_accounts(id),
    amount_minor bigint not null check (amount_minor > 0),
    principal_minor bigint not null default 0,
    interest_minor bigint not null default 0,
    source text not null check (source in ('customer','admin')),
    created_by int references bank_users(id),
    idempotency_key text not null unique,
    created_at timestamptz not null default now()
  )`;
  await sql`create index if not exists bank_loan_payments_loan_idx on bank_loan_payments(loan_id)`;
  await sql`alter table bank_holds
    add column if not exists category text not null default 'other',
    add column if not exists customer_note text,
    add column if not exists expires_at timestamptz,
    add column if not exists released_by int references bank_users(id),
    add column if not exists release_reason text`;
  await sql`create index if not exists bank_holds_account_idx on bank_holds(account_id, status)`;
  // Manual adjustments register
  await sql`create table if not exists bank_adjustments (
    id serial primary key,
    account_id int not null references bank_accounts(id),
    txn_id bigint references bank_ledger_txns(id),
    reference text,
    direction text not null check (direction in ('credit','debit')),
    category text not null,
    amount_minor bigint not null check (amount_minor > 0),
    currency char(3) not null,
    reason text not null,
    customer_memo text not null,
    notify_customer boolean not null default true,
    created_by int references bank_users(id),
    created_at timestamptz not null default now()
  )`;
  await sql`create table if not exists bank_support_tickets (
    id serial primary key,
    user_id int not null references bank_users(id) on delete cascade,
    subject text not null,
    category text not null,
    status text not null default 'open' check (status in ('open','answered','closed')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`;
  await sql`create table if not exists bank_ticket_messages (
    id serial primary key,
    ticket_id int not null references bank_support_tickets(id) on delete cascade,
    author_id int references bank_users(id) on delete set null,
    from_staff boolean not null default false,
    body text not null,
    created_at timestamptz not null default now()
  )`;
  // Session metadata so staff can see and revoke individual sign-ins
  await sql`alter table bank_sessions
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists ip text,
    add column if not exists user_agent text`;
  await sql`create index if not exists bank_sessions_user_idx on bank_sessions(user_id)`;
  // Customer account-closing requests, reviewed by staff
  await sql`create table if not exists bank_closure_requests (
    id serial primary key,
    user_id int not null references bank_users(id) on delete cascade,
    account_id int not null references bank_accounts(id) on delete restrict,
    reason text not null,
    status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
    admin_note text,
    decided_by int references bank_users(id),
    decided_at timestamptz,
    created_at timestamptz not null default now()
  )`;
  await sql`create unique index if not exists bank_closure_one_pending on bank_closure_requests(account_id) where status = 'pending'`;
  // Failed password attempts, used to temporarily lock sign-in
  await sql`create table if not exists bank_login_failures (
    id bigserial primary key,
    email text not null,
    ip text,
    created_at timestamptz not null default now()
  )`;
  await sql`create index if not exists bank_login_failures_email_idx on bank_login_failures(email, created_at)`;
  // Per-account daily sending limit (null = bank default)
  await sql`alter table bank_accounts add column if not exists daily_send_limit_minor bigint`;
  // Customer-filed transaction disputes
  await sql`create table if not exists bank_disputes (
    id serial primary key,
    user_id int not null references bank_users(id) on delete cascade,
    txn_id bigint not null references bank_ledger_txns(id) on delete restrict,
    account_id int not null references bank_accounts(id) on delete restrict,
    reason text not null,
    details text not null,
    status text not null default 'open' check (status in ('open','resolved','rejected','cancelled')),
    admin_note text,
    decided_by int references bank_users(id),
    decided_at timestamptz,
    created_at timestamptz not null default now()
  )`;
  await sql`create unique index if not exists bank_disputes_one_open on bank_disputes(txn_id, user_id) where status = 'open'`;
  // Standing orders (monthly recurring internal transfers)
  await sql`create table if not exists bank_standing_orders (
    id serial primary key,
    user_id int not null references bank_users(id) on delete cascade,
    from_account_id int not null references bank_accounts(id) on delete restrict,
    to_account_number text not null,
    amount_minor bigint not null check (amount_minor > 0),
    currency text not null,
    description text,
    day_of_month int not null check (day_of_month between 1 and 28),
    next_run_date date not null,
    end_date date,
    status text not null default 'active' check (status in ('active','paused','cancelled','completed')),
    runs_count int not null default 0,
    last_run_at timestamptz,
    last_result text,
    failures int not null default 0,
    created_at timestamptz not null default now()
  )`;
  await sql`create index if not exists bank_standing_orders_due on bank_standing_orders(next_run_date) where status = 'active'`;
  // Admin settings: one JSON document per category, plus uploaded brand images
  await sql`create table if not exists bank_settings (
    category text primary key,
    value jsonb not null default '{}'::jsonb,
    updated_by int references bank_users(id) on delete set null,
    updated_at timestamptz not null default now()
  )`;
  await sql`create table if not exists bank_setting_assets (
    slot text primary key,
    data bytea not null,
    mime text not null,
    updated_by int references bank_users(id) on delete set null,
    updated_at timestamptz not null default now()
  )`;
  const email = process.env["ADMIN_EMAIL"]?.toLowerCase();
  const password = process.env["ADMIN_PASSWORD"];
  if (email && password) {
    const existing = await sql`select id, password_hash from bank_users where email = ${email}`;
    let id: number;
    if (existing.length === 0) {
      const hash = await bcrypt.hash(password, 10);
      const rows = await sql`insert into bank_users (full_name, email, password_hash)
        values ('Administrator', ${email}, ${hash}) returning id`;
      id = rows[0].id;
    } else {
      id = existing[0].id;
      if (!(await bcrypt.compare(password, existing[0].password_hash))) {
        const hash = await bcrypt.hash(password, 10);
        await sql`update bank_users set password_hash = ${hash} where id = ${id}`;
      }
    }
    await sql`insert into bank_user_roles (user_id, role) values (${id}, 'admin') on conflict do nothing`;
  }
}

export async function db() {
  if (!schemaReady) schemaReady = setup().catch((e) => { schemaReady = null; throw e; });
  await schemaReady;
  return getSql();
}
