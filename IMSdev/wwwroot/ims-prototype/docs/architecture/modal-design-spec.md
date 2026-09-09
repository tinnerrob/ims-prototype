# IMS — Modal Design Spec & Inventory (Phase C)

**Status:** In progress
**Date:** 2026‑09‑08

## Goals
Clean, easy‑to‑read, modern modals, consistent system‑wide. Base chrome lives
in `shared.css`; per‑modal cleanup removes inline styles, groups long forms,
and aligns actions.

## Spec (shared tokens in `shared.css`)
- **Container**: `modal-dialog` centered; `modal-content` radius 22px, soft
  shadow, thin top light border, glass background; max‑height ~92vh.
- **Header**: title (icon + weight 800, 16px), border under, `X` close top‑right.
- **Body**: consistent padding; **scrolls internally** when tall (max‑height +
  overflow‑y) so the footer stays visible.
- **Footer**: primary on right (`.btn-ims`), secondary/outline to its left,
  Cancel/Close always available; consistent gap.
- **Forms**: labels 12px above inputs; inputs aligned full‑width per field‑group;
  grouped into sections with `.divider` + bold section titles for long forms.
- **Focus/accessibility**: visible focus ring; Escape closes; first field
  focused (or first control) on open.
- **States**: empty + busy handled gracefully.

## Modal inventory (C2) by origin
**Generic builders (common.js)** — style once, benefit all:
- `openRawModal` (read‑only/detail + custom)
- `openFormModal` (field list forms)

**Per module** (each to audit/restyle):
- Orders/Parties: order detail (contracts), order editor (scheduler), customer/party view+edit
- Items & Stock (inventory): serialized/bulk/consumable/part/labor view + edit; kit modal; attachment modal
- Item Hand‑Off: issue/loan wizard (handoff‑wiz), return/check‑in prompt
- Allocations (scheduler): schedule time, booking qty, overbook
- Receiving (yard): inspection add/edit, overage
- Timesheets (labor): punch clock, edit time segment
- Field service: work order
- Billing: invoice detail
- Rentals: sub‑rental (rerent)
- Admin: tax config, overhead config, branch config, category add/rename

## Per‑modal checklist
1. Opens centered, correct size; no horizontal page shift on scroll.
2. Header title + icon clear; body readable at rest.
3. Long bodies scroll internally; footer always visible with consistent buttons.
4. No inline `style=` where a class expresses intent; fields aligned.
5. Actions: Save/primary right, Cancel/Close present; works (opens/closes/saves).

## Done
- [x] C3 base chrome (mostly in `shared.css` — verify/extend scroll + footer)
- [ ] C4 per‑modal cleanup (module by module)
- [ ] C5 verify each modal opens/closes/saves
