# ble-scale: CK829 scale web app with a 5-slot tare stack

Date: 2026-10-16
Status: approved 2026-10-16

## Intent

A household uses a cheap CK829 kitchen scale (Bluetooth name `LFSc`) with
bowls of different weights. The scale's own tare button is never used. The
app shows the weight of what is *in* the bowl by subtracting a remembered
bowl weight (a "tare"), without the user naming or managing bowls.

The app must feel like a scale, not like an admin tool. The previous attempt
(the husband's alpha in `spike-beacio/`, not used as a base) was rejected
mainly because it had too many settings and buttons on the main screen.

The underlying requirements study ("Anforderungen v0.2/v0.3", copy in
`spike-beacio/docs/`) remains the domain background. Where this document
differs, this document wins.

## Goals

- One screen: big net weight, five tares, two buttons. Everything else is
  behind a single `⋯` menu.
- Never show a stale or wrong weight as current.
- Works offline after the first load.
- Runs on the household's iPhones (and iPad) in Safari with the beacio
  Safari extension.

## Non-goals

- Native iOS app, App Store, Apple developer account.
- Home-screen standalone web app mode (beacio does not provide BLE there;
  confirmed by the user's tests).
- Sending anything to the scale: no GATT connection, no writes, no pairing,
  no tare command.
- Container names, recipes, sync between devices, export/import, cloud.
- Typing in a tare value or editing a tare's grams (explicitly not wanted).
- Background reception while the phone is locked.

## Anti-goals (failure even if it "works")

- A missing packet shown as `0 g`.
- A weight shown as live after auto-off, standby or a page reload without
  a fresh empty-scale confirmation.
- Settings, diagnostics or status details cluttering the main screen.

## Confirmed facts about the hardware and platform

From the requirements study and the spike tests on 2026-10-16:

- The scale broadcasts non-connectable advertisements, about 10 per second,
  also when the weight does not change.
- Safari + beacio delivers them via `navigator.bluetooth.requestLEScan()`
  (also via `requestDevice` + `watchAdvertisements`). Manufacturer data
  arrives as a `Map` with company ID `0x0000` (must not be treated as
  falsy) and an 18-byte `DataView`.
- beacio sometimes delivers events in bursts: many events with the same
  delivery timestamp, up to about 2 s late.
- Bluefy and desktop Edge do not work (no manufacturer data / no scan API).
- Payload layout (18 bytes, company ID excluded):

  | Bytes | Meaning |
  | --- | --- |
  | 0-5 | constant per scale (`cf e9 09 19 41 d8` on the household scale); likely the device address; usable as scale identity |
  | 6-8 | prefix `CA 01 04` |
  | 9-10 | magnitude, little-endian |
  | 11-13 | sign: `00 00 00` positive/zero, `FF FF FF` negative |
  | 14 | unit; `04` = grams (only supported value) |
  | 15 | `00` or `01`, meaning unknown (possibly a settling flag); not used |
  | 16 | XOR of bytes 6-15 |
  | 17 | `FF` |

  Any frame that fails length, prefix, unit, sign pattern, final byte or
  XOR is dropped and does not count as a received frame.
- The scale switches itself off after roughly 15 s without use.
- **Test G1 result:** when the scale wakes up with a load on it, it shows
  `0 g`. So the scale's own zero cannot be trusted after any interruption;
  the app needs its own empty reference (see below).

## Scale drivers

Other BLE broadcast scales must be addable later. Each scale model is a
driver module in `src/scales/` with `{ id, name, decode(adv) }`. `adv` is a
normalized advertisement `{ name, manufacturerData: Map<companyId,
Uint8Array> }`; `decode` returns `{ grams, scaleId }` or `null`.
`src/scales/index.js` lists the drivers and tries them in order; the
result carries `model` (driver id) and a scale id prefixed with it. The
CK829 is the only driver for now. Adding a scale = adding one driver file
and registering it. Only broadcast scales fit this interface; scales that
need a GATT connection are out of scope (Claude's call).

## Measurement model

```
R = raw grams from the latest valid frame
Z = empty reference: R captured when the user confirmed "scale is empty"
G = total weight on the scale = R - Z
T = active tare grams, or 0 when "0 g" is selected
N = net weight shown big = G - T
```

- `Z` lives only in memory. It is never persisted.
- Negative values are shown as they are, never clamped to 0.
- Saving a tare always stores `G`, never `N`.

## States

| State | When | Big area shows | Tap on big area |
| --- | --- | --- | --- |
| Not connected | page opened, scan not started or stopped | button "Waage verbinden" | starts the scan (iOS requires a user tap) |
| Empty scale needed | first frames after start; first frame after "not current"; return from background; page reload | "Waage leer? Antippen" plus the current raw value | confirms `Z = R`, only when the value is steady |
| Live | fresh frames and a confirmed `Z` | `N` in grams, "netto · Tara 312 g" | saves `G` as tare (same as the "+" button) |
| Not current | no valid frame for more than 6 s | last `N`, struck through, "vor 24 s"; after 20 s a hint to wake the scale | nothing |

Rules:

- Leaving Safari or locking the phone stops the scan. Coming back goes to
  "Not connected" (iOS needs a new tap to scan), and after that to "Empty
  scale needed".
- Frames that arrive while the page is hidden are ignored.
- Scale identity (Claude's call): each scan locks onto the first valid
  frame's bytes 0-5 and ignores frames with other bytes 0-5 until the scan
  is restarted. Nothing about the scale is persisted, so a replaced scale
  just works on the next scan. Diagnose shows the locked identity.
- Only a real new frame refreshes freshness, even if the grams are the same.
- "Steady" = at least 3 frames over at least 1.5 s, all within 1 g, and the
  latest frame fresh. Use the delivery time; bursts make this slower, never
  wrongly faster.
- The tare list and the "0 g" button work in every state. Saving a tare
  works only in Live while steady; otherwise the "+" button is disabled and
  tapping the weight does nothing.

## Tare stack

- At most 5 entries, newest/last used on top. Each entry: `grams` (positive
  integer), `createdAt`, `lastUsedAt`.
- **Save** (tap on weight or "+ Gewicht als Tara"): put `G` on top and make
  it active. If an entry within ±2 g of `G` already exists, treat it as
  the same tare: replace its grams with the new `G` (fresher measurement),
  move it to the top, keep `createdAt`, update `lastUsedAt`. If several
  entries are within ±2 g, use the closest one (ties: the higher one in
  the list). A
  sixth entry drops the bottom one. Show a short message
  "843 g als Tara gespeichert" with "Rückgängig", which restores the exact
  previous list and active selection.
- **Select** (tap on an entry): the entry becomes active and moves to the
  top; entries above it shift down by one; `lastUsedAt` updates.
- **"0 g"**: no active tare (`T = 0`). The list does not change.
- **Delete**: swipe an entry to the left to reveal "Löschen"; tapping it
  removes the entry. Show "312 g gelöscht" with "Rückgängig". If the
  deleted entry was active, "0 g" becomes active.
- The list and the active selection persist across reloads. On reload the
  last active tare stays selected, but no weight is shown until a new empty
  reference is confirmed.

## Screen

Layout "B" from the mockups (https://claude.ai/artifact/2vqHVoDigF67SPbT8dRfFG,
also `.superpowers/mockups/waage-layouts.html`), portrait, no scrolling on a
small iPhone in Safari:

1. Top line: small state text with a coloured dot (state is always also
   written in words), `⋯` on the right.
2. Big area: the net weight (very large, condensed digits) and the line
   "netto · Tara 312 g", or the state-specific content from the table.
3. Five full-width tare rows: grams large on the left, last-used date on
   the right ("heute 20:48", "14.10. 09:22"). Active row filled with the
   accent colour. Empty slots stay as blank rows so the layout does not jump.
4. Bottom row: "0 g" (filled when active) and "+ Gewicht als Tara".

Behind `⋯` (a sheet):

- Theme: Auto / Tag / Nacht (Auto follows the system).
- Display: Wach / Standby. "Wach" requests a screen wake lock while visible
  and re-requests it when the page becomes visible again; the sheet shows
  whether the lock is actually held.
- "Waage verbinden" / "Verbindung trennen".
- "Leerwert neu setzen" (forces "Empty scale needed", for when someone
  pressed the scale's tare button).
- Diagnose: raw value, `Z`, last payload in hex, frames per second, dropped
  frames, beacio/API availability.
- A short note: "Tara-Taste der Waage nicht benutzen. Waage nur in Safari
  öffnen, nicht als Web-App."

UI text is German (Swiss spelling, "ss" not "ß"). Code, comments and docs
are English.

Visual direction as in the mockups: cool enamel neutrals, one green accent
for the active tare, Archivo with a narrow width for the digits, light and
dark themes. The digits are the one bold element; everything else stays
quiet.

## Technology (Claude's calls)

- Plain HTML, CSS and ES modules. No framework, no build step, no runtime
  dependencies.
- Hosted on GitHub Pages from this repo (`bstaeheli/ble-scale`, public).
  The app lives at the repo root (or `app/`, builder's choice). Remove
  `spike/` once the app works on the phones.
- Service worker: precache the app files; network-first for navigations and
  app files, falling back to the cache offline. Bump the cache name on each
  release. Never cache measurement data. Self-host the Archivo font files
  (woff2, OFL licence) in the repo so the look survives offline; do not
  load Google Fonts at runtime.
- Persistence: one `localStorage` key holding a small JSON object
  (`schemaVersion`, tare list, active tare, theme, display mode), written
  in one `setItem` call so a write is all-or-nothing. On parse failure,
  start empty and keep the broken value under a backup key.
- Pure logic (decoder, measurement state machine, tare stack) in modules
  without DOM access, tested with `node --test` and no extra packages.
- Re-render the tare list only when the list or the selection changes, not
  on every frame. beacio bursts can deliver dozens of frames at once;
  replacing the buttons that often would swallow taps on iOS.
- Manifest with `"display": "browser"` so "add to home screen" opens Safari.

## Still to verify on the devices

- Offline: open once online in Safari, then in flight mode with Bluetooth
  on, force-quit Safari, reopen, reload, scan.
- Second iPhone works the same way.
- Auto-off: frames really stop; after waking, frames return.

## Left to the builder

- File layout, module boundaries, naming.
- Exact type scale, spacing, animation details within the visual direction.
- How the swipe-to-delete gesture is implemented (pointer events, no
  library).
- Exact wording of hints and errors, following the tone above.
