# 0003: Buyer rice requests in scope

- **Status:** Proposed
- **Date:** 2026-10-15

## Context

[0001](0001-focus-on-supply-capacity-matching.md) put buyers "only at dispatch" and the buyer portal on the roadmap. The challenge form asks for "a simple digital platform with two sides", farmer and buyer, and for traceability from each farmer to the first-hand buyer.

Farmers already have a form and tracking: `/book` and `/sell`, then `/track`. Buyers had nothing to submit or track.

## Decision

Buyers get the same shape as farmers, kept small:

| Farmer side               | Buyer side                    |
| ------------------------- | ----------------------------- |
| `/book`, `/sell` (form)   | `/buy` rice request (form)    |
| Code by text              | Code by text                  |
| `/track` (status, cancel) | `/buy/track` (status, cancel) |
| Selling list (staff)      | Rice Buying list (staff)      |

- **Staff confirm:** the manager accepts or declines each request. Nothing is held until then.
- **Price at pickup:** the request shows an estimate; the dispatch sets the price.
- **No payment, no stock lock:** buyers pay at the plant, and the app issues no receipts.
- **Naming:** pages are named from the client's side. Farmers sell palay (**Selling**, `/selling`); buyers buy rice (**Rice Buying**, `/rice-buying`).

This supersedes 0001's "buyers only at dispatch" for this slice. The rest of 0001 stands.

## Why

- **Passes 0001's test:** accepted requests show which days have milled-rice demand, so the manager can mill stored palay on those days instead of idling.
- **Challenge fit:** both sides of the platform, and traceability that reaches the buyer.
- **Small:** one table and pages copied from the farmer flow.

## Risks

- **No stock lock:** two accepted requests can exceed stock. The manager checks stock on `/buy` before accepting.
- **Data Privacy Act:** the public trace shows a co-op or municipality, never a person's name.
