# DPDP Act 2023 & DPDP Rules 2025 — compliance map

LastMinute is a **Data Fiduciary**: it decides why and how personal data of customers and providers is processed. This table maps each obligation to what the product does and where the evidence is.

> This is an engineering mapping, not legal advice. Have an Indian privacy lawyer review the notice, contracts and this map before launch. The DPDP Rules 2025 phase in most obligations over 18 months from notification; build for them now.

| Obligation (Act / Rules) | What we do | Evidence |
|---|---|---|
| **Lawful purpose & consent** (s.4, s.6) | Consent is asked for before sign-up, separately for each purpose: account (needed), sharing with provider/delivery for orders (needed), marketing (optional, off by default). | `src/app/auth.tsx` (consent step), `server/src/routes/auth.ts` (`consents` required) |
| **Notice in clear language** (s.5, Rule 3) | Short notice before consent in **English and Hindi**: what we collect, why, how long, rights, how to complain; read-aloud button. Full policy screen. Notice is versioned and the version accepted is stored. | `src/lib/privacy.ts`, `src/app/privacy-policy.tsx`, `consents.notice_version` |
| **Withdraw consent as easily as giving it** (s.6(4)) | One tap in Privacy Centre; recorded with time; withdrawing order sharing stops new orders. | `src/app/privacy.tsx`, `POST /v1/me/consents` |
| **Purpose limitation & minimisation** (s.4–s.6) | Only name, phone, address (only if delivery), order notes. No location, contacts, photos or Aadhaar. Providers lose access to customer phone/address when the order ends. Public listings never show phone numbers. | `orders.ts` (`orderView`), `catalog.ts` |
| **Accuracy** (s.8(3)) | Users correct name/address themselves; correction logged. | `PATCH /v1/me` |
| **Security safeguards** (s.8(5), Rule 6) | Encryption at rest (AES-256-GCM) and in transit (HTTPS/HSTS), access control by role, masked data for staff, logged access to full numbers, audit log kept ≥1 year (we keep 3), backups encrypted. | `docs/security/README.md` |
| **Breach notification** (s.8(6), Rule 7) | Incident register in the admin console. For a personal-data breach, the console reminds staff to inform the **Data Protection Board and affected people without delay**, with a detailed report to the Board within **72 hours**; and to report cyber incidents to **CERT-In within 6 hours** (CERT-In Directions 2022). Timestamps for both notifications are stored. | Console → Security incidents; `incidents` table; `docs/security/INCIDENT_RESPONSE.md` |
| **Storage limitation** (s.8(7), Rule 8) | Daily retention sweep: OTPs, expired sessions, order contact details 90 days after completion, stale devices. Erasure on account deletion. Bills kept 8 years without identity (tax law). | `server/src/retention.ts` |
| **Grievance redressal** (s.8(10), s.13, Rule 14) | Named Grievance Officer contact in app and policy; in-app grievance tickets with 7-day SLA (well inside the statutory maximum); overdue tickets flagged in the console. | `POST /v1/grievances`, Console → Privacy requests |
| **Right to access** (s.11) | "Download my data": profile, consents history, orders, reviews, shop, nominee, and who it was shared with. | `GET /v1/me/export` |
| **Right to correction & erasure** (s.12) | Correction screen; account deletion with PIN re-entry, blocked only while orders are active. | `DELETE /v1/me` |
| **Right to nominate** (s.14) | Nominee name, phone, relation stored encrypted. | `POST /v1/me/nominee` |
| **Children** (s.9) | Service is 18+ only; sign-up requires an 18+ declaration and the server rejects sign-up without it. | `isAdult: z.literal(true)` |
| **Processors** (s.8(2)) | Only via written contract: cloud host, SMS gateway. Delivery partners are independent (the user books them in their own app; we only copy addresses to the user's clipboard). | To do: sign DPAs |
| **Cross-border transfer** (s.16) | Host in an Indian region to keep it simple. | Deployment checklist |
| **Significant Data Fiduciary** (s.10) | Not expected at launch. If notified (volume/sensitivity), appoint a DPO in India, independent audit and DPIA. | Review yearly |

## Still to do outside the code

1. Lawyer review of notice, policy and in-app texts (EN + HI), then add more Indian languages (Marathi, Tamil, Bengali…).
2. Appoint and publish the real Grievance Officer contact (replace the placeholders in `src/lib/privacy.ts` and `GRIEVANCE_*` env vars).
3. Data Processing Agreements with the host and SMS provider.
4. Record of processing activities (purpose, data, retention, recipients) — this table is the start.
5. Yearly review of retention periods and access rights; run a breach drill (the console supports a test incident).
