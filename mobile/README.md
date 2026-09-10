# Money OS — mobile, local by design

A separate React Native / Expo application for Android and iOS. Financial data
stays in an SQLCipher database on the device. Credentials stay in the native
secure store. There is no Money OS login, financial-data server, analytics SDK,
advertising SDK, or over-the-air update service in this application.

This is an **implementation for device testing**, not an App Store / Play Store
release. JavaScript exports and automated tests are not substitutes for testing
SQLCipher, Keychain/Keystore, device authentication and broker access on hardware.

## What is implemented

- Device authentication before opening the database; background locking and a
  privacy cover while inactive. Native document/share dialogs require another
  authentication before returning to the financial interface.
- Encrypted SQLite persistence that refuses to open without SQLCipher. A random
  256-bit database key is kept in SecureStore with device-only accessibility.
- Manual accounts, income/expense records, reversible transfers with **separate
  sent and received amounts for different currencies**, and transaction history.
- Portfolio readings, per-account balance history, goals and subscription plans.
- Totals separated by currency. Unknown values are labelled, not replaced by
  zero. Synced positions already inside equity are not added to net worth again.
- Direct read requests using the existing Hyperliquid, Trading 212, Bybit,
  Binance, Kraken, OKX and MEXC connectors. Endpoint/method allowlists, HTTPS,
  redirect refusal, timeouts and cancellation on lock apply to their transport.
- Bank and investment CSV preview, validation and duplicate handling. A history
  import never increments an already-current balance. Imported manual-account
  positions use the existing average-cost reconstruction and do not invent
  current market prices.
- User-exported, password-encrypted backups (AES-256-GCM / PBKDF2-SHA256), full
  validation and atomic restore. API credentials and credential references are
  excluded. Restore disconnects all restored accounts until the user reconnects.
- Removal of saved credentials, local data reset and in-app privacy information.
- OS automatic backup exclusions: Android cloud/device-transfer exclusions and
  iOS Documents directory excluded from backup. No iCloud keychain sync requested.

## Running on a device

Requirements: Node 24, npm, and either Android Studio with an Android SDK or
macOS with Xcode for iOS. SQLCipher requires a **native development build**;
Expo Go is intentionally refused rather than using an unencrypted fallback.

From the repository root:

```bash
cd mobile
npm ci
npm run android
```

For iOS on a Mac:

```bash
cd mobile
npm ci
npm run ios
```

After installing the native development build, `npm start` starts Metro.
Device biometrics or a device passcode must be configured. The debug build's
connection to Metro is development infrastructure, not part of the release
financial-data architecture.

`eas.json` also supplies development, APK preview and production profiles. EAS
is optional build infrastructure: it is not used for storing user finance data.
Account setup, project linking and signing are intentionally not automated here.
Before using remote builds, inspect the build context: **never upload real
`.env`, backups, CSV statements, database files or broker secrets**.

## Architecture

| Location | Responsibility |
| --- | --- |
| `App.tsx` | Device-authentication gate, lifecycle, system dialogs and navigation |
| `src/ui` | Native screens; no credentials sent to a Money OS service |
| `src/domain` | Validated document schema, exact stored money, imports, backup codec |
| `src/storage` | SQLCipher, generated schema migrations, atomic vault repository, SecureStore |
| `src/services` | Direct provider transport, allowlist, credential lifecycle, user file dialogs |
| `../src/lib` | Existing financial arbiters, parsers and connector implementations |
| `plugins` | Native automatic-backup exclusions |

The mobile signing adapter implements only the Node `createHash`/`createHmac`
surface used by the shared connector code, using `@noble/hashes`. Metro rejects
server-only imports such as `pg`, `fs` and `next`. Database actions in the web
application are not bundled into mobile.

The encrypted database stores one validated financial document. This makes
save/restore a single atomic SQLite operation. There is one serialized writer,
so two overlapping edits cannot overwrite each other's balances. API responses
are fetched before entering that writer. A failed or cancelled sync preserves
the previous reading. Current size limits are 500 accounts, 100,000 events,
100,000 snapshots and a 20 MB plaintext backup payload.

Database schema changes must still be generated, never handwritten:

```bash
npm run db:generate
```

This runs Drizzle and bundles the journalled SQL into a generated TypeScript
module for native startup. The document format has a separate version; adding
financial fields requires a document/backup migration policy as well.

## Verification

```bash
npm run typecheck
npm test
npm run test:connectors
npm run db:generate
npm run export
```

The SQLite tests exercise real SQLite transactions through Node's `node:sqlite`.
They do **not** claim to test native SQLCipher encryption. The backup tests check
authenticated encryption, password failures and round-trips of every collection.
Connector regressions use the portable mobile signing adapter.

## Explicit limits of this version

- No full parity with all web screens: category budgets, the learning library,
  benchmark/FX refresh and web-specific reporting have not been ported. Goals
  are planning values and do not reserve money on a broker or bank.
- The old web JSON backup is a different format and is **not** silently accepted.
  Use bank/investment CSV for history. Automatic full migration from a web
  PostgreSQL instance is not implemented.
- No background polling or exact-time alerts. Synchronization is requested by
  the user in the app, and each reading displays its timestamp.
- No execution of bank transfers, orders or withdrawals. The in-app transfer
  form records an event that already happened elsewhere.
- Read-only permissions are declared by the user; this version does not verify
  every provider's key permission metadata. Use keys created with no trading or
  withdrawal permissions. The app itself blocks all unlisted endpoints/methods.
- Account/platform IDs, region rules, key access and rate limits still need real
  device checks. The existence of connector code is not a verified integration.
- IBKR's existing connector needs its desktop Gateway; not offered on mobile.
  Trade Republic remains CSV-only. Bybit global does not imply Bybit EU support.
- Some connectors cover only selected wallets or may return a subset when a
  venue refuses an optional endpoint. Scope is stated and limited-wallet totals
  are marked partial. No claim that every product at an exchange is included.
- No multi-device automatic sync. Backups need a password the user remembers.
  A lost device and no backup means the Money OS publisher cannot recover data.
- SecureStore is not an invulnerability claim: broker credentials must briefly
  enter app memory to sign requests. A compromised device remains a risk.

See [RELEASE.md](RELEASE.md) for the concrete device checks before a store submission.

## Sources used for native behavior

- [Expo SQLite and SQLCipher](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [Expo LocalAuthentication](https://docs.expo.dev/versions/latest/sdk/local-authentication/)
- [Expo ScreenCapture](https://docs.expo.dev/versions/latest/sdk/screen-capture/)
- [Apple Keychain](https://developer.apple.com/documentation/security/keychain-services)
- [Android Keystore](https://developer.android.com/privacy-and-security/keystore)

Licence: the repository's [AGPL-3.0](../LICENSE). Store distribution/signing and
the final application identity must be reviewed by the project owner before release.
