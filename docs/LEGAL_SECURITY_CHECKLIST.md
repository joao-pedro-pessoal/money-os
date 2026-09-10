# Legal, privacy and security checklist

This is a release checklist for Money OS as a personal financial-data aggregator.
It is not legal advice or proof of compliance. A lawyer qualified in every launch
jurisdiction must review the final product, company structure, contracts and flows.

The product scope must remain explicit: Money OS reads and organises data users
already have. It does not execute purchases, sales, transfers or withdrawals, and
does not hold customer money. It must not provide personalised recommendations
or tell users what to buy, sell or hold. If that scope changes, obtain a fresh
regulatory review before implementation.

## Broker connections and API keys

- Request only read-only permissions. Reject or prohibit trading, withdrawal,
  transfer and account-management permissions.
- Store keys only on the user’s device in Keychain, Keystore or SecureStore.
  Never send plaintext keys to Money OS servers, analytics, crash reports,
  support tickets or logs.
- Keep keys out of URLs, screenshots, clipboard history, notifications, exports,
  backups and source maps.
- Show the broker, account, permission scope and last successful read. State
  which wallets or products a connector does not cover.
- Use HTTPS, endpoint and method allowlists, redirect refusal, timeouts and
  cancellation when the app locks. Never follow arbitrary API response URLs.
- Let users remove keys locally and explain how to revoke them at the broker.
- Do not claim that device-only storage prevents phishing, malware, device theft,
  broker compromise or user-caused losses.
- Check every broker’s API terms, branding rules, rate limits and permissions;
  retain evidence and repeat the check when a connector changes.

## Privacy and GDPR (EU/Portugal)

Identify the legal entity, controller/processor roles, purposes, lawful basis,
data categories, retention periods and every supplier handling data. Keep a data
map and record of processing activities; obtain legal advice on whether a data
protection impact assessment is required.

- Publish a privacy notice before collection: what is collected, why, where it is
  stored, retention, recipients, and access, correction, deletion, portability
  and objection rights.
- Collect only what each feature needs. Do not put broker credentials on a
  server when direct device connections provide the feature.
- Do not add analytics, advertising IDs, profiling, contact uploads or training
  reuse without a separately reviewed purpose and legal basis.
- Use written processor agreements for hosting, database, email, crash reporting
  and support. Check sub-processors, locations and international transfers.
- Provide deletion, export and correction flows, including backup expiry rules.
- Keep access logs free of financial values and credentials; restrict staff
  access, require MFA and review administrative access.
- Maintain a breach plan for detection, containment, evidence, user communication
  and authority deadlines. GDPR Article 82 can create compensation liability
  where a controller or processor is responsible for processing damage.
- Review cookies, local storage, service workers, notifications and crash reports
  for personal-data collection and consent requirements.

## Warnings shown in the app

Show these before a connection or external link, in every supported language:

- “Money OS is read-only. It cannot buy, sell, transfer or withdraw money.”
- “Data comes from your bank or broker and may be delayed, incomplete or wrong.
  Check the provider before making a decision.”
- “Money OS is not a bank, broker, custodian or investment adviser.”
- “Do not create API keys with trading or withdrawal permissions.”
- “Never share API keys, secrets, passwords or recovery phrases with support.”
- “Missing prices and exchange rates are shown as unknown, never silently as zero.”
- “A connector may cover only selected wallets or products.”
- “External links are third-party sites with their own terms and privacy policies.”
- “If the device is lost or compromised, revoke the broker key immediately.”

Warnings must be accessible to screen readers and must describe actual behaviour.
A disclaimer cannot excuse a feature that behaves like trading, advice or custody.

## Security release gates

- Threat-model web, mobile, sync, backups, connectors, deep links, notifications
  and support.
- Keep secrets out of Git, builds, telemetry and errors. Separate and rotate
  development and production credentials.
- Encrypt transit and storage. If sync is called end-to-end encrypted, prove the
  server cannot decrypt it and document device linking, revocation and recovery.
- Use short-lived sessions, CSRF protection, rate limits, brute-force protection,
  secure cookies and server-side authorization on every action. Test tenant
  isolation before enabling multiple users.
- Validate CSV/API input and treat symbols, names, URLs and descriptions as
  untrusted content. Prevent injection and spreadsheet formula execution on export.
- Review dependencies and vulnerabilities, sign releases where practical, and
  define patch and rollback procedures.
- Test lock, biometrics, screenshots, background snapshots, backups, restore
  failures, upgrades and partial sync failures on real devices.
- Obtain an independent security review before handling outside users’ data.
- Maintain an incident runbook, security contact and vulnerability-reporting path.

## Contracts and operations

- Terms must describe scope, limitations, freshness, third-party dependencies,
  support, deletion and applicable law. A lawyer must review liability limits;
  disclaimers cannot remove liability for fraud, negligence or mandatory rights.
- Never claim “completely safe”, “fraud-proof”, “real-time” or “fully accurate”.
- Keep a versioned inventory of connectors, permissions, fields, links and claims.
- Support must never request secrets and must verify identity before account help.
- Check age, accessibility, consumer, tax, company, insurance and app-store
  requirements in every launch country.
- Review open-source licences, broker trademarks, external-site terms and data
  redistribution restrictions.
- Before release, test clean install, deletion, export, key revocation, offline
  mode, upgrade/rollback and restore on a second device.

Keep dated evidence of legal review, privacy notice, terms, data map, processor
agreements, DPIA decision, threat model, permissions, connector checks, security
tests, release approvals and incident exercises. Revisit this checklist whenever
the app adds a provider, field, sync mode, recommendation or money-moving action.

References: [GDPR Article 82](https://eur-lex.europa.eu/eli/reg/2016/679/2016-05-04),
[MiFID definition of investment advice](https://eur-lex.europa.eu/legal-content/en/TXT/?uri=CELEX%3A32004L0039).
