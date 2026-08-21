-- Optional mobile number on the contact form.
--
-- Nullable with no default: absent means the visitor did not give one, which is
-- the common case and must stay distinguishable from an empty string. The
-- column carries personal information, so it is only ever read by the admin
-- surface behind Cloudflare Access (api/admin.ts), never by a public route.
ALTER TABLE leads ADD COLUMN phone TEXT;
