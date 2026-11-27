# ShopnoJatra — Disaster Recovery & Business Continuity Plan

**Business Continuity, Point-in-Time Recovery (PITR) & Runbooks**  
**Phase 7: Autonomous Enterprise Platform Transformation**  
**Status**: APPROVED DR BASELINE  
**Recovery Targets**: RTO < 30 Minutes | RPO < 5 Minutes  
**Author**: CTO & Principal Enterprise Architect (Antigravity Orchestrator)

---

## 1. Objectives & Business Continuity Targets

The ShopnoJatra Disaster Recovery (DR) plan defines concrete recovery targets and step-by-step technical playbooks to recover from critical infrastructure outages, database corruption, cloud provider failures, or malicious attacks without data loss.

### Target Recovery Metrics
* **Recovery Point Objective (RPO)**: **< 5 Minutes**  
  Maximum acceptable data loss window. Supported by continuous PostgreSQL Write-Ahead Log (WAL) streaming to encrypted, geo-replicated object storage.
* **Recovery Time Objective (RTO)**: **< 30 Minutes**  
  Maximum acceptable platform downtime before core booking, payment, and ticketing services are restored in a secondary operational zone.

---

## 2. Backup Architecture & Continuous Point-in-Time Recovery (PITR)

```
[PostgreSQL Primary Instance]
        │
        ├─► [Local NVMe Disk] (Active Transaction Log)
        │
        ├─► [Continuous WAL Archiving (`pgBackRest` / `wal-g`)]
        │          │
        │          ▼ (Encrypted Stream, Uploaded every 60s)
        │   [Immutable S3 / GCS Bucket: `shopnojatra-db-wal`]
        │   (Object Lock: 30-Day Retention, Multi-Region)
        │
        └─► [Automated Daily Base Snapshot (02:00 UTC)]
                   │
                   ▼
            [Encrypted Snapshot: `shopnojatra-db-base`]
```

### A. Backup Policies
1. **Continuous WAL Archiving**: Every 16MB WAL segment (or 60 seconds of inactivity) is compressed with Zstandard and streamed to secondary cloud object storage.
2. **Daily Physical Base Backups**: Full binary backup taken nightly at 02:00 UTC during off-peak hours.
3. **Automated Weekly Restoration Drill**:
   - Every Sunday at 04:00 UTC, an automated CI worker provisions a temporary container, downloads the latest base backup + WAL stream, replays transactions up to 5 minutes prior, and runs the 254-test suite against the restored database.
   - If test suite fails, an alert is dispatched to `#sre-dr-alerts`.

---

## 3. Disaster Scenarios & Recovery Runbooks

### Runbook 1: Primary Database Corruption or Instance Failure
**Trigger**: Primary database becomes unresponsive; hardware failure or disk corruption.
* **Step 1: Failover Detection (< 2 minutes)**:
  - Health probe detects 3 consecutive failed database ping attempts.
  - Automatic PgBouncer routing pauses incoming transactions.
* **Step 2: Standby Promotion (< 3 minutes)**:
  - Promote synchronous read-replica to primary:
    ```bash
    pg_ctl promote -D /var/lib/postgresql/data
    ```
  - Update PgBouncer primary pool connection string.
* **Step 3: Verification & Traffic Resumption (< 5 minutes)**:
  - Execute database health check: `SELECT 1;`.
  - Unpause PgBouncer; verify booking creation and ledger writes resume cleanly.

### Runbook 2: Accidental Schema Dropping or Data Corruption
**Trigger**: Rogue migration or accidental `DROP TABLE` executed against production.
* **Step 1: Halt Incoming Writes (< 1 minute)**:
  - Set platform into read-only maintenance mode via Cloudflare Workers / Nginx header injection:
    `503 Service Unavailable: Scheduled Maintenance Window`.
* **Step 2: Identify Precise Point in Time (Timestamp $T$)**:
  - Inspect audit log or WAL transaction timestamps to locate the exact second prior to the malicious/corrupt query.
* **Step 3: PITR Restore to Secondary Target (< 20 minutes)**:
  ```bash
  # Restore base backup and replay WAL logs up to timestamp T
  pgbackrest --stanza=shopnojatra --type=time "--target=2026-11-27 18:30:00+00" restore
  ```
* **Step 4: Promote & Switch DNS**:
  - Point application connection strings to restored instance.
  - Lift maintenance mode; verify zero data was lost prior to time $T$.

### Runbook 3: Cloud Region Outage (Multi-Region Business Continuity)
**Trigger**: Complete data center / cloud region loss.
* **Step 1**: Re-route Cloudflare edge DNS to secondary cold standby region (e.g. Singapore &rarr; Tokyo).
* **Step 2**: Provision FastAPI worker containers via Terraform / Pulumi in secondary region.
* **Step 3**: Mount latest PITR database replica; initialize Redis state.
* **Step 4**: Resume operations within the 30-minute RTO boundary.

---

## 4. Safe Rollback Strategy (Expand/Contract Database Migrations)

To prevent downtime and ensure zero data loss during bad deployments:
1. **Never Break Backward Compatibility in a Single Release**:
   - **Phase 1 (Expand)**: Add new column as `NULLABLE`. Deploy new backend code that writes to both old and new columns, reading from old.
   - **Phase 2 (Migrate)**: Run background Celery worker backfilling existing rows.
   - **Phase 3 (Switch)**: Deploy code that reads from the new column.
   - **Phase 4 (Contract)**: In subsequent release, drop old column and enforce constraints (`NOT NULL`).
2. **Instant Container Rollback**:
   - Deployments use Blue/Green container tagging.
   - If health checks fail during rollout, traffic routing remains 100% on Blue containers; zero customer impact.
