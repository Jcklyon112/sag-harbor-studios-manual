# Backlog

Deferred items, tracked so they are not lost.

- **Visual design.** Refined navy/white theme with Inter applied (Oct 2026). Further styling changes go through the tokens at the top of `style.css`.
- **Rent received ledger.** Dashboard rent is what the leases say is due, not what was actually paid. A per-month "received" record would show arrears.
- **Proration.** A lease that starts or ends mid-month counts the full month's rent.
- **Repeating escalations.** Only one rent increase per lease is modelled (from its escalation date onward).
- **Bill payment record.** Recurring bills estimate future costs; actual payments are recorded as costs.
- **Live calendar feed.** Calendar exports a one-off .ics; a subscribable feed needs a Supabase Edge Function with a secret token URL.
- **Expiry reminders by email.** Lease end and notice deadlines show on the dashboard and calendar only.
- **Custom domain.** Site runs on the github.io URL; can move to e.g. manual.sagharborstudios.com via a CNAME.
- **Leaked-password protection.** Supabase Auth setting (Auth > Attack Protection) currently off; turn on.
