# Expert Review & Improvement Plan

## Executive Summary
The repository already has strong feature breadth (PWA metadata, i18n support, budgeting workflows, dashboards, and offline/service worker structure), but the main `index.html` remains a **very large monolith** blending markup, styles, and behavior. This creates avoidable maintenance risk and slows future iteration.

In this pass, I implemented immediate, low-risk quality improvements focused on UI polish, accessibility, and CSS correctness. I also documented a prioritized roadmap for deeper modernization.

## Improvements Implemented in This Pass

1. **Fixed CSS parsing issue in layout styles**
   - Corrected an orphaned `min-width: 0;` declaration so it is properly scoped inside `.right-panel`.
   - Benefit: avoids invalid CSS and prevents grid overflow issues in some browser/layout combinations.

2. **Defined missing global CSS variables for consistent theme rendering**
   - Added `--primary-color` and `--accent-color` to `:root`.
   - Benefit: prevents `var(--primary-color)` fallback failures in light mode and improves visual consistency.

3. **Improved accessibility with keyboard skip navigation**
   - Added a visible-on-focus **Skip to main content** link.
   - Benefit: faster keyboard/screen-reader navigation and better accessibility conformance.

4. **Refactored dark mode toggle UI for maintainability and visual consistency**
   - Replaced brittle inline styles with reusable CSS classes (`.theme-toggle`, `.theme-toggle-control`, etc.).
   - Benefit: cleaner markup, easier styling updates, better consistency with the rest of the design system.

5. **Respected reduced-motion user preference**
   - Added a `prefers-reduced-motion` block to reduce animation/transition intensity.
   - Benefit: improved accessibility and comfort for motion-sensitive users.

## Priority Findings (Next Steps)

### P0 / High Impact
1. **Split `index.html` into modules**
   - Move inline CSS into `styles/` files and inline JS into `scripts/` modules.
   - Introduce a lightweight bundling/build step (or at minimum script/style includes).

2. **Eliminate inline event handlers (`onclick`, `onchange`)**
   - Migrate to `addEventListener` and centralized event binding.
   - This will improve CSP hardening potential and testability.

3. **Validate malformed/duplicated markup near modal regions**
   - There are signs of mixed/duplicated content blocks in the rollover/deficit modal area that should be normalized.

### P1 / Medium Impact
4. **Introduce basic automated checks**
   - Add HTML/CSS linting (`htmlhint`, stylelint) and formatting (Prettier).
   - Add CI workflow for lint checks on PRs.

5. **Accessibility audit**
   - Validate heading hierarchy, aria labels, color contrast, and form labels across tabs/modals.
   - Add keyboard-trap handling for modals.

6. **Performance tuning**
   - Defer non-critical scripts where possible.
   - Audit Chart.js load strategy and render timing.

### P2 / Long-Term Maintainability
7. **Componentize major UI regions**
   - Split budget summary, expense form, dashboard cards, and settings into reusable components/templates.

8. **Create domain-layer structure for business logic**
   - Separate storage, budgeting rules, rollovers, analytics, and rendering concerns.

## Review Scope
- Primary focus in this pass: `index.html` (layout/CSS/a11y/UX maintainability).
- No backend or external deployment infrastructure changes were required.
