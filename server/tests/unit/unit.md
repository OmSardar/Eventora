# Server Unit Tests Documentation (`server/tests/unit`)

## A. Directory Overview
The `server/tests/unit` directory contains fast, isolated unit test suites that verify pure business functions, cryptographic hashing routines, email template formatting, and Zod input validation schemas without requiring database connectivity or network calls.

## B. Directory Structure
```text
server/tests/unit/
├── unit.md                  # This documentation file
├── emailService.test.js     # HTML and text template rendering, attendee name interpolation
├── password.test.js         # Argon2id password hashing and constant-time verification
└── validation.test.js       # Zod schema checks for authentication and event inputs
```

## C. File-by-File Documentation

### 1. `emailService.test.js`
- **File Type:** Node.js Native Test (`node:test`, `node:assert`)
- **Primary Responsibility:** Validates transactional email formatting logic.
- **Test Scenarios (4 tests):**
  1. `buildConfirmationEmailHtml`: Verifies generated HTML contains event title, attendee name, venue, formatted date, ticket URL, and valid doctype.
  2. `buildConfirmationEmailText`: Verifies clean plain-text fallback formatting.
  3. `sendRegistrationConfirmationEmail`: Rejects safely when attendee record has no email address.
  4. `getResendClient`: Confirms `getResendClient()` returns null in test environment to avoid accidental outbound emails.

### 2. `password.test.js`
- **File Type:** Node.js Native Test (`node:test`, `node:assert`)
- **Primary Responsibility:** Verifies Argon2id cryptographic operations.
- **Test Scenarios (4 tests):**
  1. Hashes plain password into secure Argon2id string format (`$argon2id$...`).
  2. Correctly verifies valid password against generated hash.
  3. Rejects invalid or incorrect password against hash.
  4. Safely handles empty or null input without crashing process.

### 3. `validation.test.js`
- **File Type:** Node.js Native Test (`node:test`, `node:assert`)
- **Primary Responsibility:** Verifies Zod validation rules and error mapping.
- **Test Scenarios (3 tests):**
  1. Accepts valid registration inputs; rejects passwords missing uppercase, number, or symbol; rejects invalid roles.
  2. Validates login schema with email and password.
  3. Verifies event creation schemas (accepts future dates, rejects past dates, rejects negative or zero seat limits).

## D. Child Directory Documentation
No child subdirectories exist in this directory.

## E. Execution Flow
Run via:
```bash
npm run test:unit --prefix server
```
Executes using Node.js 22 native test runner: `node --test tests/unit/**/*.test.js`.

## F. Related Documentation
- [Tests Parent Directory (`server/tests/tests.md`)](../tests.md)
- [Server Root Documentation (`server/server_root.md`)](../../server_root.md)

