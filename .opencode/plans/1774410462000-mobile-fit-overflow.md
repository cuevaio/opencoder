# Mobile Fit Plan — Overflow and Positioning Corrections

## Observations From Provided Screenshots
- New Session: horizontal overflow in repository row (refresh icon button protrudes outside container).
- New Session: mobile layout is vertically centered, creating wasted top space and increasing below-the-fold pressure.
- Dashboard: mostly contained, but nested key cards are dense; action/status rows risk wrap pressure on very narrow widths.
- Chat Session: footer/composer stack is too tall relative to viewport; transcript area competes for space and bottom actions sit too close to edge.

## Root Causes
1. Flex width contracts are inconsistent (`w-full` children in rows with sibling controls, and non-shrinking controls).
2. Some mobile pages still use desktop-like centering (`justify-center`) for tall forms.
3. Composer/footer regions lack compact mobile mode and safe-area spacing balance.
4. A few rows need explicit `min-w-0`, `flex-1`, and wrapping behavior to avoid horizontal bleed.

## Execution Plan

### Phase 1 — Width Contract Fixes (Global + Reusable)
- Update `src/components/ui/button.tsx` so default buttons can shrink in flex rows when needed.
- Keep explicit `shrink-0` only where required (icon/utility controls).
- Add/confirm `min-w-0` on text-heavy controls where truncation is expected.

### Phase 2 — New Session Fit Fixes
- In `src/components/chat/RepoSelector.tsx`:
  - Make main trigger `flex-1 min-w-0` instead of `w-full` in mixed rows.
  - Keep refresh button fixed width with `shrink-0`.
- In `src/routes/_authed/chat.index.tsx`:
  - Switch mobile from centered layout to top-aligned layout (`justify-start` on mobile, optional center at larger breakpoints).
  - Reduce vertical padding so all controls fit within first viewport on common mobile sizes.

### Phase 3 — Chat Session Vertical Fit
- In `src/components/chat/ChatView.tsx`:
  - Enforce `min-h-0` and `overflow-x-hidden` contracts in header/content/footer stack.
  - Increase bottom safe-area spacing for `End session` and composer controls.
- In `src/components/chat/ChatFooter.tsx`:
  - Add compact mobile spacing variant for running sessions (slightly tighter stack, no clipping).
  - Ensure controls wrap or stack instead of forcing overflow.

### Phase 4 — Dashboard Stability on Narrow Widths
- In `src/routes/_authed/dashboard.tsx`:
  - Ensure status/action rows wrap predictably at narrow widths.
  - Ensure key action groups do not overflow their cards.

## Files To Update
- `src/components/ui/button.tsx`
- `src/components/chat/RepoSelector.tsx`
- `src/routes/_authed/chat.index.tsx`
- `src/components/chat/ChatView.tsx`
- `src/components/chat/ChatFooter.tsx`
- `src/routes/_authed/dashboard.tsx`

## Acceptance Criteria (Must Pass)
- No horizontal overflow at 320, 360, 375, 390, and 430 widths.
- Repository selector row stays fully inside card boundaries on New Session.
- Chat footer and `End session` always visible and not clipped by viewport/safe-area.
- Dashboard cards and key rows remain inside container bounds at mobile widths.
- Desktop layout behavior remains intact (`md+`).

## Verification
- `bun run check`
- `bun run build`
- Manual visual checks for `/chat` (new + session) and `/dashboard` at 320–430 widths.
