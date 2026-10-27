# Working on Lullabo

See README.md for the stack, commands and architecture. Conventions the code doesn't show:

## Visual style

- The look follows Duolingo: flat colours, chunky rounded shapes, a solid darker bottom edge
  on buttons and cards that collapses when pressed, bold rounded type.
- **Icons are Duolingo-style too**, always, without being asked: flat filled shapes or bold
  round-capped strokes (stroke width 3 on a 24 grid), rounded corners, no thin outlines, no
  gradients or shadows. Put new icons in `apps/web/src/components/ui/` next to `Chevron.tsx`
  (or `features/events/EventIcon.tsx` for record types) and draw them as inline SVG using
  `currentColor` or the theme tokens; don't add an icon library.
- Scroll areas bounce at their ends like iOS, horizontally or vertically: give a new one
  `useBounce` (`apps/web/src/lib/bounce.ts`). Sheets lock the page behind them.

## Records

- Every record kind (breastfeeding, bottle, solids, sleep, pumping, diaper, temperature,
  medication, growth, note) is defined once in `packages/shared/src/record-kinds.ts`:
  instant (one time) or duration (timer, or start and how long). Read behaviour from there
  instead of switching on types.
- Start, duration and end of a duration record change together through one state machine
  (`apps/web/src/features/events/duration-times.ts`); every place that edits them uses it.
  Times are shown with `TimeRow` and formatted by `formatDayTime`.

## Language

- User-facing copy is Chinese (Paraglide messages); code, commits and PRs are English.
