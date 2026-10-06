# Retention

## Current status (honest)

Defentrax **does not yet ship an automated event/alert retention or purge job**. Event and alert volume will grow with your agents until **you** apply an operational policy (SQL jobs, partitioning later, or external lifecycle tools).

Configurable today:

| Item | Mechanism |
|------|-----------|
| Session lifetime | `SESSION_TTL_HOURS` (default 24) — expired sessions should not be reused |
| Enrollment tokens | `expires_at` on token rows |
| Alert dedup window | `ALERT_DEDUP_COOLDOWN_SEC` (not deletion — suppresses duplicate opens) |
| Login / ingest rate limits | Env windows — not data retention |

Project context calls for **configurable retention** as a product goal; automated purge is a post-phase-20 / post-v1 candidate (see [ROADMAP.md](../../ROADMAP.md)).

## Recommended operator policy

1. Decide retention for **events**, **alerts**, **audit_logs**, and **notification delivery history** separately (compliance often needs longer audit retention than raw events).
2. Prefer deleting or archiving by `received_at` / `created_at` in batches during maintenance windows.
3. Always **backup** before mass deletes ([backup.md](backup.md)).
4. Keep indexes healthy; very large `events` tables may need partitioning in a future release — plan capacity accordingly.
5. Document your policy next to the deployment (runbook), not only in chat.

### Example (manual — operator-owned)

Illustrative only; adjust tables/columns to your schema and legal requirements. Test on a staging restore first:

```sql
-- EXAMPLE: delete old events older than 90 days (VERIFY before production use)
-- DELETE FROM events WHERE received_at < now() - interval '90 days';
```

Do **not** run destructive SQL against production without a recent backup and a change window.

## Redis

Treat Redis as ephemeral. Flushing Redis may drop rate-limit / window state and sessions — users re-authenticate; detection windows reset. It does **not** delete PostgreSQL history.

## Related

- [privacy.md](privacy.md)
- [backup.md](backup.md)
- [troubleshooting.md](troubleshooting.md) — disk growth
