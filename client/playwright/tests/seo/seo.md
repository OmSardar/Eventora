# Playwright SEO Tests Documentation (`client/playwright/tests/seo`)

## A. Directory Overview
This directory contains automated tests verifying technical SEO, canonical URLs, OpenGraph social tags, structured data (JSON-LD), robots.txt rules, sitemap generation, and brand icon integrity.

## B. Directory Structure
```text
client/playwright/tests/seo/
├── seo.md               # This documentation file
└── seoAndBranding.spec.ts # SEO, metadata, canonicals, JSON-LD, and brand icon tests
```

## C. File-by-File Documentation

### 1. `seoAndBranding.spec.ts`
- **File Type:** Playwright Test Spec (`.spec.ts`)
- **Primary Responsibility:** Technical SEO and brand mark assertions.
- **Test Scenarios (6 tests):**
  1. Homepage contains complete metadata, canonicals, OG tags, and `WebSite`/`Organization` JSON-LD.
  2. Events listing page contains appropriate title, canonical, and social tags.
  3. Authentication and private dashboard routes enforce `noindex, nofollow`.
  4. Brand header logo links to homepage with accessible `aria-label`.
  5. Metadata routes (`/robots.txt`, `/sitemap.xml`) and static brand assets (`/favicon.ico`, `/favicon.svg`, `/icon.png`, `/apple-icon.png`) return HTTP 200.
  6. Event detail page renders dynamic Event schema and metadata without leaking private attendee data.

## D. Child Directory Documentation
No child subdirectories exist in this directory.

## E. Execution Command
```bash
npx playwright test playwright/tests/seo
```

## F. Related Documentation
- [Playwright Tests Root (`client/playwright/tests/tests.md`)](../tests.md)
- [Client Root Documentation (`client/client_root.md`)](../../../client_root.md)

