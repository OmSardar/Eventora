# Eventora Git History Security Cleanup Report

**Author:** DevSecOps Engineering & Security Specialist  
**Target Repository:** `Eventora` (`main` branch)  
**Date:** November 8, 2026  
**Status:** Audit & Remediation Completed — Awaiting User Approval to Force Push

---

## 1. Executive Summary

A comprehensive Git history audit and cryptographic credential purge was conducted on the Eventora codebase to ensure strict compliance with production security standards and assignment evaluation criteria.

- **Incident:** An active Resend API key (`re_bZ4...uvyh`) was accidentally included in historical revisions of `render.yaml` and `server/src/infrastructure/email/emailService.js`.
- **Action Taken:** Complete historical sanitization was executed via `git-filter-repo`. All historical instances of `render.yaml` were expunged from the commit tree, and all occurrences of the exposed key string were rewritten to `***REMOVED***`.
- **Infrastructure File Reinstated:** A minimal, non-sensitive 10-line `render.yaml` was re-created at `HEAD` strictly for deployment specifications (without environment variables or credentials).
- **CI Fix Applied:** GitHub Actions CI failure (missing `EMAIL_FROM` environment variable during backend tests) was resolved, along with a client-side hook dependency warning.
- **Verification:** 100% of test suites pass (150/150 tests), client compiles with zero warnings/errors, and cryptographic string inspection confirms zero leaked secrets remain in Git history.

---

## 2. Pre-Operation Backup

Before initiating any history rewrite, an exact, immutable bare mirror clone was generated:

- **Backup Type:** Bare Mirror Clone (`git clone --mirror`)
- **Backup Path:** `d:\THE OMS DEVS\WEB DEVS\MERN PROJECTS\PERSONAL\EVENTORA-pre-cleanup-backup.git`
- **Integrity Check:** Validated bare repository structure (`git rev-parse --is-bare-repository` -> `true`).

---

## 3. Threat Assessment & Exposure Findings

During deep inspection of reachable Git history, the following credential instances were identified:

| Item | Location in History | Action Taken |
| :--- | :--- | :--- |
| **Resend API Key** (`re_bZ4...uvyh`) | Commits `52015c8`, `bf69489`, `7e67476` | Replaced across all commits with `***REMOVED***` |
| **render.yaml** (Historical) | Historical commits | Purged from all ancestral commits via `--invert-paths` |
| **Simulated Credentials** (Mock IDs, Test Secrets) | Unit/Integration Tests | Validated as test fixtures restricted strictly to `NODE_ENV === 'test'` |

No other credentials, database connection strings (MongoDB Atlas passwords), or production Razorpay secrets were found in Git history.

---

## 4. History Scrubbing Execution

The sanitization was executed using `git-filter-repo` (v2.47.0):

1. **Path Inversion for `render.yaml`:**
   ```bash
   python -m git_filter_repo --replace-text replace_secret.txt --invert-paths --path render.yaml --force
   ```
2. **Text Replacement:**
   Rewrote all occurrences of the exposed Resend token to `***REMOVED***`.
3. **Commit Tree Repack:**
   Git reflogs and dangling loose objects were purged and repacked.

---

## 5. Current `render.yaml` Specification

As required, `render.yaml` was re-added at `HEAD` with strictly deployment metadata and zero credentials or environment variables:

```yaml
services:
  - type: web
    name: eventora-server-omslabs
    runtime: node
    plan: starter
    rootDir: server
    buildCommand: npm install
    startCommand: npm start
    healthCheckPath: /api/v1/health
    autoDeploy: true
```

All production credentials remain securely managed exclusively via the Render Dashboard environment settings.

---

## 6. GitHub Actions CI Failure Diagnosis & Remediation

### Root Cause
GitHub Actions CI run `42481119157` failed at step `Run Backend Tests (Unit, Integration, Security)` (`135 passed, 15 failed`).
- **Diagnosis:** In CI, no `.env` file exists on the runner. The workflow file `.github/workflows/ci.yml` lacked `EMAIL_FROM` under the backend test environment block. In `emailService.js`, `sendEmail()` checked `if (!fromEmail)` and returned an error before entering test simulation mode, causing all email-dependent integration tests to fail.
- **Frontend Warning:** In `client/src/components/seating/SeatMap.tsx`, `seats` was defined as `seatsData || []` outside `useMemo`, triggering React Hooks exhaustive-deps warnings in `next lint`.

### Remediation
1. **`server/src/infrastructure/email/emailService.js`:** Added safe fallback for test mode:
   ```javascript
   let fromEmail = process.env.EMAIL_FROM || (process.env.NODE_ENV === 'test' ? 'Eventora <notifications@mail.omslabs.tech>' : null);
   ```
2. **`.github/workflows/ci.yml`:** Added `EMAIL_FROM: Eventora <notifications@mail.omslabs.tech>` to test runner env.
3. **`client/src/components/seating/SeatMap.tsx`:** Memoized `seats`:
   ```typescript
   const seats: EventSeatItem[] = useMemo(() => seatsData || [], [seatsData]);
   ```

---

## 7. Verification & Audit Results

### 1. Secret Search Verification
- `git log --all --full-history -- render.yaml` -> **0 matches (only present in HEAD commit)**
- `git log -S "re_bZ4" --all` -> **0 matches**
- Python regex scan for `re_[a-zA-Z0-9_]{30,}` -> **0 exposed keys**

### 2. Test & Build Verification
- **Backend Test Suite:** 150/150 tests passed (`# pass 150, # fail 0`).
- **Frontend Linting:** `next lint` -> `✔ No ESLint warnings or errors`.
- **Frontend Build:** `next build` -> `✓ Compiled successfully, static pages generated (18/18)`.

---

## 8. Deployment and Next Steps

The local repository is completely clean, verified, and ready.
- **Remote:** Reconfigured to `https://github.com/OmSardar/Eventora.git`.
- **Branch:** `main`.

> [!WARNING]
> Because Git history has been rewritten to purge historical secrets, publishing these changes requires a force-push (`git push origin main --force`).
> In adherence to strict security protocols, **force-pushing requires explicit user authorization**.
