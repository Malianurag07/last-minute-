# Incident response runbook

Use this when something might be a security or privacy incident: suspicious logins, `refresh_token_reuse_detected` alerts, audit-chain check failing, leaked credentials, lost staff laptop, data sent to the wrong person.

## 0–1 hour: contain
1. Open an incident in **Admin console → Security incidents** (tick "Personal data affected" if it is). This starts the timeline.
2. Stop the bleeding: disable the affected admin (Admin accounts → Disable), block abusive users, rotate leaked secrets (`npm run keys`, redeploy), turn on `ADMIN_IP_ALLOWLIST`.
3. Preserve evidence: export logs and the audit table; don't delete anything.

## Within 6 hours: CERT-In
Report reportable cyber incidents to **CERT-In within 6 hours** of noticing (CERT-In Directions, April 2022). Keep logs for 180 days in India.

## Without delay: Data Protection Board & affected people (DPDP Rules 2025, Rule 7)
If personal data was breached:
- Inform the **Data Protection Board** without delay, and send the detailed report (what happened, data and people affected, impact, steps taken, contact person) within **72 hours**.
- Tell **affected people** in plain language (in the app + SMS): what happened, possible impact, what we did, what they should do (e.g. change PIN), and whom to contact.
- Tick "Board notified" / "Users notified" in the console so the timestamps are recorded.

## After: fix and learn
- Mark the incident *contained*, then *closed* once fixed.
- Write a short blameless review: cause, fix, how we'll catch it sooner.
- Run **Verify integrity** on the audit log and attach the result.
- Practise this runbook every 6 months with a test incident.
