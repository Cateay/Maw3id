# Maw3id

## Project structure

- `public/` — customer and admin interfaces.
- `public/admin-dashboard.html` — the single canonical admin dashboard.
- `public/admin.html` — legacy redirect to the canonical dashboard; it contains no duplicate admin UI.
- `public/email-admin.js` — email center frontend logic.
- `api/` — Vercel API routes. Kept at the top level because Vercel uses file-based routing.
- `database/schema.sql` — database schema/migrations used by the project.
- `database/admin_emails.sql` — focused migration/reference for `admin_emails`.

## Email center flow

1. Create a new email.
2. Save it as a draft.
3. Open Drafts and edit it.
4. Send it.
5. The same database row becomes `sent` (no duplicate history row).
6. Resend failures are recorded as `failed` with `error_message`.
7. Failed messages can be retried from the history without creating a duplicate row.
8. Drafts, sent messages, and failed messages can be deleted permanently by the admin.

## Important

The email center uses the existing `public.admin_emails` table. It does not create a second email table.
