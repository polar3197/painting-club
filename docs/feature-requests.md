# Feature requests + voting — DB/API design

Plan for persisting the "request something for the app" board (currently the
iOS screen `ios-v1/src/screens/RequestFeature.tsx` uses in-memory state).

Grounded in existing patterns: FastAPI + async SQLAlchemy, `src/db/models.py`,
`src/db/db_ops/`, routes in `src/api/main.py` behind the `get_current_member`
dependency, migrations in `src/db/db_manager.py`.

## Requirements
- Store requests (title + description + who submitted).
- Up/down vote counts per request.
- **A user may vote up OR down at most once per request.**
- Tapping the already-selected vote **unvotes**; tapping the other arrow **switches**.

## 1. Schema — two tables (`models.py`)

### `feature_request`
| column | type | notes |
|---|---|---|
| `id` | UUID PK | |
| `title` | Text, not null | |
| `description` | Text | |
| `creator_id` | UUID FK → `member.id` (ON DELETE SET NULL) | who submitted |
| `created_at` | timestamptz, default now() | |
| `status` | Varchar, default `'open'` | optional: open/planned/done/declined |

### `feature_vote` — one row = one member's vote on one request
| column | type | notes |
|---|---|---|
| `member_id` | UUID FK → `member.id` (CASCADE) | **PK part 1** |
| `request_id` | UUID FK → `feature_request.id` (CASCADE) | **PK part 2** |
| `direction` | SmallInt | `+1` up, `-1` down |
| `created_at` | timestamptz | |

The **composite PK `(member_id, request_id)`** enforces one-vote-per-user-per-request
at the DB level (races included) — same shape as `Media_Members` / `BlockedMember`.

## 2. Vote toggle — one endpoint, small state machine

`POST /feature-requests/{id}/vote`, body `{ "direction": "up" | "down" }`,
behind `get_current_member`. In one transaction:

```
existing = SELECT * FROM feature_vote WHERE member_id=me AND request_id=id
if not existing:            insert (direction)   # first vote
elif existing.dir == new:   delete               # tap same arrow -> unvote
else:                       update dir = new      # switch up<->down
return fresh counts + my_vote
```

First tap = vote, same again = unvote, other = switch. Idempotent/safe.

## 3. API endpoints (all behind `get_current_member`)
- `GET  /feature-requests` -> list; each item:
  `{ id, title, description, creator_username, created_at, up_count, down_count, my_vote }`
  where `my_vote` ∈ `"up" | "down" | null`.
- `GET  /feature-requests/{id}` -> single (same shape).
- `POST /feature-requests` -> `{ title, description }`; creator = current member.
- `POST /feature-requests/{id}/vote` -> the toggle above.
- *(later, optional)* `DELETE /feature-requests/{id}` (creator/admin),
  `PATCH .../status` (admin).

## 4. `db_ops/feature_requests.py`
- `db_list_feature_requests(db, member_id)` — counts + caller's own vote in one query:
  ```sql
  SELECT r.*,
    COALESCE(SUM(CASE WHEN v.direction=1  THEN 1 END),0) AS up_count,
    COALESCE(SUM(CASE WHEN v.direction=-1 THEN 1 END),0) AS down_count,
    mine.direction AS my_dir
  FROM feature_request r
  LEFT JOIN feature_vote v    ON v.request_id = r.id
  LEFT JOIN feature_vote mine ON mine.request_id = r.id AND mine.member_id = :me
  GROUP BY r.id, mine.direction
  ORDER BY (up_count - down_count) DESC, r.created_at DESC;
  ```
  Computing counts on read = always correct, no drift. If the list grows big,
  denormalize `up_count`/`down_count` onto `feature_request` and bump them in the
  vote op (optimization, not needed at first).
- `db_create_feature_request(db, member_id, title, description)`
- `db_toggle_vote(db, member_id, request_id, direction)` -> state machine; returns
  updated counts + my_vote.

## 5. Migration
New tables -> `Base.metadata.create_all` (already run in `db_manager.py`) creates
them. Keep the idempotent style (guarded `CREATE TABLE IF NOT EXISTS` / create_all).
No column ALTERs since these are fresh tables.

## 6. iOS wiring (replace the local state)
- **API client** (`api/index.ts`): `get_feature_requests(token)`,
  `create_feature_request(title, desc, token)`, `vote_feature_request(id, direction, token)`.
- **Type**: `FeatureRequest { id, title, description, creator_username, up_count, down_count, my_vote }`.
- **`RequestFeature.tsx`**: fetch on focus instead of `useState([])`. `vote()` calls
  the endpoint and optimistically updates counts + `my_vote` (same toggle math
  client-side), reconcile with the response.
- **Selected state**: use `my_vote` to render the chosen arrow filled/colored
  (e.g. up arrow green when `my_vote === 'up'`), so taps clearly toggle it.

## Edge cases handled
- Double-vote impossible (composite PK).
- Unvote / switch = the toggle op.
- Deleting a member or request cascades their votes.
- Sort by score (`up - down`), ties broken by recency.

## Deploy note
Backend is a separate deploy from the iOS OTA. The iOS wiring is OTA-safe (no new
native modules); the DB/API is a backend deploy.
