# IMS — API Adapter Contract (Phase A‑5)

**Status:** Draft contract
**Date:** 2026‑09‑08

## Goal
Modules never read/write `IMS.*` directly. Today `IMS.store` serves in‑memory
JSON with repositories + change events; a server API can later back the **same**
repository methods without touching any module/view.

## Backing the store with an API
Set `IMS.store.api.adapter = <Adapter>` where an Adapter implements async,
JSON‑shaped methods. Repositories keep their local signature so callers don’t
change:

### Repository surface (per resource: `parties`, `orders`, `movements`, `labor`, …)
- `list()` → `Promise<Array<JSON>>`
- `get(predicate)` → `Promise<JSON|null>`
- `create(record)` → `Promise<JSON>` (server assigns id when relevant)
- `update(idField, id, patch)` → `Promise<JSON|null>`
- `remove(idField, id)` → `Promise<boolean>`

### Adapter methods the store expects
- `list(resource)` → JSON array
- `get(resource, id)`
- `create(resource, record)`
- `update(resource, id, patch)`
- `remove(resource, id)`

### Transport/shape rules
- Request/response bodies are **JSON only**.
- Errors resolve as rejected promises with `{ status, code, message }`.
- Dates serialized as ISO‑8601 strings (`YYYY-MM-DDTHH:mm` or full).
- IDs are strings; money/quantities are numbers; enums use the canonical terms
  (`order`/`party`/`itemType`/`movement kind`/`policy`).
- Pagination/query params: `page`, `pageSize`, `filter`, `sort` (server side).

## Local fallback
When no adapter is set (`mode:"local"`), the store uses in‑memory JSON and, if
`save()` is called, persists a snapshot to `localStorage` under `ims.store`.

## Migration note
A1/A2 scaffold is in `js/store.js`. Migrating module writes onto repositories is
Phase A‑3 (per module); views that still mutate `IMS.*` are phased out as that
lands.
