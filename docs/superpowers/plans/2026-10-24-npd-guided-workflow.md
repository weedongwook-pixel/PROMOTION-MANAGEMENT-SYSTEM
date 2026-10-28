# NPD guided workflow implementation plan

Goal: Implement the user-approved five-step workspace for manual entry and imports: project, flavors, subsets, products, review. Allow mixed categories, preserve drafts and manual input, and reuse a powder row across overlapping import sources.
Architecture: Extend the existing RD state and draft/payload contracts. Add a focused wizard renderer driven by state rather than duplicate forms. Keep local code reservation and existing submission acknowledgement. No live email or deployment in this implementation.
Spec: User confirmation in this conversation, 24 October 2026.

## Tasks
- [x] 1. Add per-product categories and append imports with reuse of same-name draft subsets. Regression tests verify unchanged prior items, stable shared powder codes, category codes and rollback.
- [x] 2. Add a project powder library, manual and Excel flavor selection, existing/new subset targets and reuse in new subsets. Persist it in drafts; preserve RM versus CMPOS identity and differing recipes. Imported old targets must never be silently dropped.
- [x] 3. Build five visible steps with guidance, skip choices, accessible navigation, issue links and final review. Preserve all values while changing steps, restore progress from drafts, and gate submit on unresolved references.
- [x] 4. Run full Node suite, desktop/mobile browser workflows with supplied workbook and manual entry, plus fresh review.

## Review focus
- Import after manual entry must not replace existing work.
- Distinct recipes ENF 1/2 keep distinct CMPOS; repeated ENF 1 reuses its code.
- No-subset products must be allowed without adding empty subsets.
- Mixed categories and import-specific store conditions must remain explicit.
- Draft resume/back navigation and cancellation must not lose reservations or submit partially.

## Decisions / progress
- Preserve the existing uncommitted requested changes in the current workspace; do not discard them or deploy during this work.
- Existing user-confirmed flow is authorization to implement; no further design approval needed.
- 2026-10-28: Task 4 done. Node suite 393/393; `scripts/test-npd-workflow-browser.cjs` passes with the Enoki/Mala workbook at 1440px and 390px (replaces the stale replace-on-import `test-npd-excel-browser.cjs`). Fixes from verification and review: suggested default dates no longer block the first append; review step now matches submit/backend rules (powder name length, duplicate names/abbreviations, partial recipe rows); a default-unit-only recipe row is neither an error nor sent to IT; library powders match imported size-suffixed flavors without merging distinct sizes; flavor import completes standard rows only on subsets in the file; chosen/resumed dates block mismatched sheets; store confirmation rejects conditions matching no branch.
- Open (low): append switches the form's default category to the import's, which can recode older uncategorised products; pre-change drafts may hold item codes on dropped empty products; new powders merged into a subset with an applied abbreviation do not get the suffix.
