# Device acceptance before distribution

The implementation is not signed, submitted to a store, or approved by a store.
The bundle identifiers in `app.json` are proposed identifiers and must be checked
against the owner's Apple/Google accounts before the first production build.

## Device checks

Use synthetic data first. Check Android and iOS independently.

1. Install the native build. Confirm startup refuses a plain SQLite / Expo Go
   environment and requires device authentication. Test Face ID, fingerprint,
   device-code fallback, cancellation, lockout and a device with no lock code.
2. Create two manual accounts in EUR and USD. Record income/expense, transfer
   different sent/received amounts, and undo it. Restart the app and compare
   the values. Kill the app during a save; old or new complete state must remain.
3. Inspect the database file on a test device: an ordinary SQLite reader must
   not read it. Confirm SQLCipher opens with the device key only. Inspect WAL
   files and app logs for plaintext data. Do not print real keys into logs.
4. Background the app, switch tasks, lock the screen and reopen. Check the
   task-switcher image contains no financial values. Check screenshots on both
   platforms. Test a file picker and share sheet, then cancellation/reauth.
5. Connect a dedicated read-only test API key. Inspect outbound requests: only
   the selected broker should receive data. Test bad keys, expired keys, region
   restrictions, blocked IP, 429, timeouts, malformed payloads and redirects.
   A failed sync must keep the last valid balance and its timestamp.
6. Exercise every offered connector against its intended regional account.
   Reconcile equity, separate wallets, positions, unknown prices and scope
   against the provider. Never enable unsupported regions by guessing a host.
7. Disconnect and verify the key is removed from SecureStore. Reconnect,
   background mid-save/sync, restart, and verify no dangling credential
   reference or unexpected reauthentication bypass.
8. Import canonical investment CSV and bank CSV, then import them again.
   Include quoted descriptions, duplicate real rows, invalid dates, missing
   amounts, signed commissions and different currencies. Confirm preview
   matches the file and imports do not change the current measured balance.
9. Export a password-encrypted backup. Open the file in a text viewer: no
   balances or API keys should be readable. Test a wrong password, altered
   ciphertext and a full restore on a different device. Confirm all collections
   and timestamps survive and every broker needs reconnecting.
10. Test encrypted backup sharing and selecting Files/Drive/another destination.
    Confirm the exported file exists where chosen and can be restored. Check
    picker copies are removed from cache, including after a crash and restart.
11. Verify OS cloud backup and device-to-device transfer exclusions. On iOS,
    verify the Documents directory has the exclusion resource value. On Android,
    inspect both generated XML backup files and verify actual backup/restore.
12. Run local data deletion and restart. Confirm the finance document is empty
    and no connected account can sync without newly supplied credentials.
13. Inspect accessibility, VoiceOver/TalkBack, large text, keyboard avoidance,
    long account names, many accounts/positions, small phones and tablets.

## Submission preparation

- Build signed release binaries with the owner's signing accounts. Verify the
  release build does not depend on Metro or expose the development launcher.
- Set final icon, screenshots, support contact, privacy-policy URL, versioning,
  app description and the countries where verified connectors can be offered.
- Complete the stores' privacy/data-safety and financial-feature declarations
  based on observed release behavior, including direct broker communication.
- Review API provider terms and distribution requirements; a read-only local
  architecture is not a promise of store approval or an exemption from rules.
- Review repository/dependency licences for the chosen store distribution.
- Provide reviewers a usable demonstration route with synthetic data and clear
  setup instructions; never give reviewers the owner's financial credentials.
- If charging for digital features, implement the applicable store purchase
  flow before advertising paid functionality. No billing is implemented here.
