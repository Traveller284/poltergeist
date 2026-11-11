---
inclusion: always
---

# Haunted UI rules (Costume Contest)

The judging question is whether spooky design elements enhance the app's function. Decoration without function loses points.

## Principle
Every spooky element must carry information.

| Element | Information it carries |
|---|---|
| Room (a spec) | Which spec; candle brightness = share of properties passing |
| Ghost | One failing property; opacity = how long it has been failing |
| Cause of death tag | First bad commit hash, author, date |
| Last words bubble | Shrunk counterexample, shown in monospace |
| Banishing animation | A property now passes again |

## Visual direction
- Dark background, one warm accent (candlelight) and one cold accent (ghost blue). Do not use more than two accents.
- Serif display font for room names, monospace for commits and counterexamples.
- Motion: slow, subtle floating for ghosts. Respect `prefers-reduced-motion` and turn animation off when set.

## Accessibility (do not skip)
- Text contrast at least WCAG AA on every background.
- Every ghost has a text equivalent in a list view, reachable by keyboard. The haunted view is never the only view.
- Color is never the only signal for pass or fail.

## Demo flow the UI must support in under 3 minutes
1. Healthy house: all rooms lit.
2. A scheduled check fires and a ghost appears in one room.
3. Click the ghost: cause of death and last words are shown.
4. Fix the commit: the ghost is banished.
