# Signed-in banking dashboard

## What I’ll build
- Replace the simple signed-in account screen with a dashboard layout.
- Add a responsive sidebar with an icon beside every menu item.
- Add a User Details card showing initials, full name, a unique customer ID based on the existing user record, KYC action, Profile, and Logout.
- Make Dashboard the active menu item and create its page content.
- Add the remaining requested items as visible menu entries only; they will not open pages yet.

## Menu structure
- Main Menu: Dashboard, Transactions, Cards, Transfers
- Transfers: Local Transfer, International Wire, Deposit
- Services: Loan Request, IRS Tax Refund, Loan History
- Account: Settings, Support Ticket

## Technical details
- Continue using the existing external PostgreSQL connection and current secure session cookie.
- Reuse the existing signed-in user lookup for name and ID; no Lovable Cloud integration.
- Preserve the current login redirect to `/account` and make that route the dashboard.
- Keep the sidebar usable on smaller screens with a menu trigger.
- Add complete page metadata and verify the signed-in experience, build health, and responsive layout.
