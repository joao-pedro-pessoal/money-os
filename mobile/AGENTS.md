# Mobile rules

Read the repository root's CLAUDE.md financial rules. This directory is a native
app, not a Next.js page or a static export of the web application.

- Data storage belongs in `src/storage`; do not import root `src/actions` or `src/db`.
- Keep credentials out of the financial document, exports, logs and error messages.
- Do not add an unencrypted browser/Expo Go fallback, a central proxy for broker
  credentials, telemetry, remote updates or automatic cloud backups.
- Use the existing root financial arbiters/parsers. A second definition of net
  worth or cost basis will eventually disagree with the first.
- A connector must use the injected native transport and its exact allowlist.
  Do not silently follow redirects with authentication headers.
- Never invent a zero price or sum different currencies. Partial wallet scope
  and old readings must be visible in the UI.
- Use `LocalVault.update` for financial changes and generated Drizzle migrations.
- Device-only implementation claims require native device checks. A successful
  Metro export does not prove Keychain, biometric or SQLCipher behavior on hardware.
- Run `npm run typecheck`, `npm test`, `npm run test:connectors`, `npm run
  db:generate` (no changes), and `npm run export` after changes to mobile behavior.
- Run the root project gates if shared root code or build configuration changes.
