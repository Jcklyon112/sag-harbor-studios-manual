# Sag Harbor Studios building manual

Operations manual for 200 Division St. Static site on GitHub Pages; all data, logins and files live in Supabase.

## What is where

- **This repo (public):** page code only. No tenant data, codes or documents are ever committed.
- **Supabase project `sag-harbor-studios`:** database (all records), Auth (logins), Storage bucket `documents` (private files, served by short-lived signed links).
- `config.js` holds the Supabase project URL and publishable key. Both are designed to be public; access is enforced by row-level security.

## Roles

| | Admin | Manager |
|---|---|---|
| Building, contacts, access & codes, bills, documents | all rows, edit | rows not marked "Internal only", read |
| Calendar items, contacts | edit | add/edit non-internal rows |
| Schedule log, utility bills | edit | add/edit |
| Tenants & leases, income, users | yes | hidden |
| Delete anything | yes | no |

The first account created becomes admin. Every later account starts as manager; promote on the Users page.

## Adding a person

1. Supabase dashboard, Authentication, Users, **Invite user**, enter their email.
2. They click the email link, land on the manual, set a password.
3. Change their role on the Users page if needed.

Public sign-up is turned off, so nobody can create their own account.

## Updating the code

Edit, commit, push to `main`. GitHub Pages redeploys in about a minute.

- Add a field: add the column in Supabase (SQL editor) and one line in `sections.js`.
- Schema source of truth: `schema.sql`. Append later changes to it and run them in the Supabase SQL editor.

## Supabase settings this depends on

- Authentication, Sign In / Providers: **Allow new users to sign up = off**.
- Authentication, URL Configuration: **Site URL** and **Redirect URLs** = the GitHub Pages URL (invite and reset links return there).
