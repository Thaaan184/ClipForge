# ClipForge v3 Operational Runbook

## 1. Quickstart & Service Orchestration

### Running with Docker Compose (Production / Staging)
```bash
# 1. Clone repository
git clone https://github.com/Thaaan184/ClipForge.git
cd ClipForge

# 2. Configure environment
cp .env.example .env # Set CF_LLM_API_KEY, CF_LLM_BASE_URL

# 3. Launch full stack (Worker, API, Web)
docker compose up -d --build

# 4. Verify service health
curl http://localhost:8765/health    # Worker health
curl http://localhost:8000/healthz   # API health
curl -I http://localhost:8080        # Web frontend
```

### Running Locally for Development
1. **Start Remotion Worker:**
   ```bash
   cd apps/worker
   npm install
   node src/server.mjs
   # Output: [ClipForge Remotion Worker] Listening on http://0.0.0.0:8765
   ```
2. **Start Backend API:**
   ```bash
   cd apps/api
   uv run uvicorn clipforge.api.app:app --host 0.0.0.0 --port 8000 --reload
   ```
3. **Start Web Frontend:**
   ```bash
   cd apps/web
   npm run dev -- --port 5173
   ```

---

## 2. Maintenance & Operations

### Monitoring Disk Space & Retention
The editorial engine creates temporary workspaces under `data/workspaces/`. Disk usage can be queried and pruned via API:
```bash
# Check disk usage
curl http://localhost:8000/api/editorial/disk-usage

# Trigger cleanup of workspaces older than 24 hours (dry-run)
curl -X POST http://localhost:8000/api/editorial/cleanup \
     -H "Content-Type: application/json" \
     -d '{"max_age_hours": 24, "dry_run": true}'

# Execute actual prune
curl -X POST http://localhost:8000/api/editorial/cleanup \
     -H "Content-Type: application/json" \
     -d '{"max_age_hours": 24, "dry_run": false}'
```

### Crash Recovery & Idempotent Retry
If a worker or network glitch interrupts an editorial session:
```bash
# Re-trigger automated recovery
curl -X POST http://localhost:8000/api/editorial/sessions/<SESSION_ID>/retry
```
The recovery engine inspects session artifacts, rolls back incomplete edits, re-triggers rendering/normalization, and updates the status to `PREVIEW_READY` or `DONE`.

---

## 3. Troubleshooting & FAQ

### Issue: Remotion worker fails with "Chromium revision is not downloaded"
- **Cause:** `PUPPETEER_EXECUTABLE_PATH` or `REMOTION_CHROMIUM_EXECUTABLE_PATH` not set or Chromium missing.
- **Fix:** Install `chromium` via apt: `apt-get install -y chromium` and ensure `REMOTION_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`.

### Issue: Typecheck error during preview/final render
- **Cause:** Composition uses unauthorized syntax or missing imports.
- **Fix:** Verify TSX against `apps/worker/template/tsconfig.json`. Ensure no forbidden globals (`process.env`, `eval`) are present.
