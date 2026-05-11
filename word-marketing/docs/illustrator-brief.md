<!-- changedown.com/v1: tracked -->
# Mascot illustration brief — capybara

For the marketing site at `changedown.com`. Per plan T0.3, spec §7 (Mascot) and §9 (illustration brief).

## What we need

Three editorial spot illustrations of a **capybara** — not a beaver. There is no capybara emoji in Unicode, which is why our placeholders use 🦫 in copy and source. The final art needs to be unambiguously a capybara.

### Capybara identifying features (please honor)

- Short, rounded ears (not the long flat ears of a beaver)
- Blunt nose, slightly flattened
- Sturdy, barrel-shaped body
- Short legs
- **No flat scaly tail** — capybaras have a tiny vestigial tail
- Calm, slightly stoic expression. Not cute-cartoon. Not Disney.

Reference images attached separately (please request if not included).

### Three poses, v1

| Pose | Use on the site | Notes |
|---|---|---|
| **Idle** | Hero, header, FAQ, footer; default state everywhere | Calm three-quarter view, facing the viewer. Sitting or standing relaxed. The "present, not chatty" voice — alert but not eager |
| **Working** | `/install` ("setting up your seat"); future `/how-it-works` | At a small desk with an open document in front. Reading or writing. Suggests collaboration without anthropomorphizing too far |
| **Wave** | Sandbox scene 7 (the "done" summary), 404 page | Turned slightly, hand or paw raised in a small gesture. Friendly but reserved — a nod, not a cheer |

## Style direction

**Reference language:** editorial spot illustration — think New Yorker single-panel spots, Stripe Press chapter openers, Bloomberg Businessweek covers. Not flat-vector. Not cartoon. Not Disney. Not pixel art. Not 3D-rendered.

**Medium:** ink line + 1-2 warm fills. The site's palette uses:

- `--copper-light` (`#e9d5a8`) — light warm tan
- `--cream-deep` (`#e3d8be`) — soft beige
- `--ink-primary` (`#2a2823`) — near-black for lines and accents

The line work should carry the illustration; fills should be restrained. Imagine the cover of a thoughtful weekly magazine printed on uncoated paper.

**Scale:** the mascot appears at 32–96px on screen. The illustration should hold up at small sizes — line weights need to read at 32px, but the file should be vector so it scales cleanly upward.

**Tone:** the capybara is a *guest* in the design, not the host. Present, not performative. Don't over-anthropomorphize.

## Deliverables

For each of the three poses:

- **SVG** with editable layers (line, fills as separate layers). Keep paths clean — we'll embed inline in HTML and animate the idle pose later (gentle 4-second breathe loop, optional v2)
- **PNG fallback** at 2x (192px) and 3x (288px) for environments where SVG isn't ideal
- Background should be transparent (we'll place against `--cream-paper` `#f6f1e8` in production)

Also: one **favicon-friendly capybara head silhouette** derived from the idle pose. Single-color (copper, `#b67d3a`), filled silhouette, designed to read at 16px and 32px. SVG only.

## What we'll do with it

The artwork lands in `word-marketing/src/assets/illustrations/` and `word-marketing/public/favicon.svg`. We replace the placeholder SVGs and remove the `data-placeholder="true"` attribute. The Mascot component (`word-marketing/src/components/Mascot.astro`) is already wired — we just swap files.

If the optional v2 stretch happens later (a Lottie or CSS animation cycle on idle), we'll come back to the illustrator. For now: three static poses + favicon.

## Timeline

Lead time ~2-3 weeks. T10.7 (mascot artwork integration) blocks on this delivery. The site can ship without it using placeholders if needed — but launch quality really wants the real art.

## Practical notes

- File naming: `mascot-idle.svg`, `mascot-working.svg`, `mascot-wave.svg`, plus `mascot-idle.png` / `mascot-idle@2x.png` / `mascot-idle@3x.png` etc.
- License: work-for-hire, all rights to ChangeDown. The team will discuss attribution credit in the site footer.
- Process: one mid-point sketch review before final art (so we can catch beaver-drift early).

## Contact

Project lead handles direct correspondence with the illustrator. This brief is the technical reference; the rest is over coffee.


[^cn-1]: ai:claude-opus-4.6 | 2026-05-11 | creation | proposed
    ai:claude-opus-4.6 2026-05-11T01:58:10Z: File created