# Handoff — Messages: edit/delete + hide empty conversations

Written 2026-07-14 for a parallel Claude session. Two cohesive, mostly-independent
tasks in the **messages** area. The other session (me) is concurrently working on
events / observability / announcements / Settings / weekly-prompt — so the
messages files are yours alone; watch the shared hotspots noted in §4.

## Scope (2 items)

1. **Hide empty conversations** — the conversation list should only show threads
   where at least one message has actually been sent (no ghost DMs from opening a
   thread that was never used).
2. **Long-press a message → edit or delete it** — holding a message bubble in a
   thread pops a choice ("edit" / "delete"); edit lets you rewrite the text,
   delete removes it. Author-only.

Both are reasonable and self-contained. #1 is small (one query filter). #2 is
full-stack (no message edit/delete endpoints exist yet).

## 1. Hide empty conversations (backend-only, small)

- `src/db/db_ops/messages.py` → `db_list_conversations(db, me_id)` (line ~92)
  builds each row's `last_message` / `last_message_at` (both `None` when the
  thread has no messages — see ~line 185). **Filter those out**: only include
  rows where `last_message_at is not None`, right before the final
  `out.sort(...)` (~line 192). One-liner.
- Groups: decide if a brand-new group with no messages should show for its
  creator. Simplest + matches the ask: hide all message-less threads uniformly.
- No schema change, no migration. The FE (`Messages.tsx`) needs no change — it
  just renders fewer rows.

## 2. Message edit / delete (full-stack, medium)

**No PATCH/DELETE message endpoints exist** — only GET/POST under
`/conversations/{id}/messages` (`src/api/main.py` ~2619–2669). You add them.

### Backend
- **Model** (`src/db/models.py`, class `Message`): optionally add
  `edited_at = Column(DateTime)` so the UI can show "(edited)". If you do, add an
  idempotent guard to `run_migrations()` in `src/db/db_manager.py`:
  `ALTER TABLE message ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP` (paper-trail
  file: **`src/db/migrations/024_message_edited.sql`** — 024 is the next free
  number; 022/023 are taken by the other session, 024 was reserved but unused).
  A brand-new column on an existing table DOES need the guard (create_all won't
  add it) — unlike new tables.
- **db_ops** (`src/db/db_ops/messages.py`): add `db_edit_message(db, message_id,
  sender_id, new_body)` and `db_delete_message(db, message_id, sender_id)`. Both
  must check the message's `sender_id == caller` (author-only) and raise on
  mismatch so the route can 403. For delete, decide hard-delete vs. tombstone
  (hard-delete is simplest; if a thread's last message is deleted, the
  conversation-list `last_message` recomputes naturally on next fetch).
- **Routes** (`src/api/main.py`, in the messages block ~2669): add
  `PATCH /conversations/{conversation_id}/messages/{message_id}` (body `{body}`,
  → `MessageOut`) and `DELETE /conversations/{conversation_id}/messages/{message_id}`.
  Gate on `get_current_member`; 403 if not the author, 404 if not found.
  Return `MessageOut` on edit; `{ "ok": true }` on delete.
- **Pydantic** (`src/api/models.py`): reuse `MessageIn {body}` for edit;
  add `edited_at` to `MessageOut` if you added the column.
- **Route-ordering gotcha** (bit us before): FastAPI matches in definition
  order. `/conversations/{id}/messages/{mid}` is fine next to the existing
  `/conversations/{id}/messages`, but keep the `{message_id}` routes AFTER the
  collection route and make sure no earlier `/conversations/{id}/{something}`
  can shadow them.

### Frontend
- **API client** (`ios-v1/src/api/index.ts`): add `edit_message(conversationId,
  messageId, body, token)` and `delete_message(conversationId, messageId, token)`.
  `get_messages` / `send_message` already exist — mirror their shape (Bearer
  token, JSON body).
- **Types** (`ios-v1/src/api/types.ts`): `MessageOut` — add `edited_at?: string |
  null` if you added the column.
- **Thread UI** (`ios-v1/src/screens/ConversationThread.tsx`): add an
  `onLongPress` to each message bubble that belongs to the current user
  (`sender_username === currentUser`). Only the author sees the menu. Use the
  app's existing dialog pattern — there's a `ConfirmDialog` component and the
  codebase uses `Alert`/custom sheets elsewhere. For edit, drop into an inline
  editor (or a small modal `TextInput` prefilled with the body) → `edit_message`
  → update the message in local state. For delete → confirm → `delete_message` →
  remove from local state. Optimistic update + refetch-on-failure is the pattern
  used elsewhere (see `RequestFeature.tsx` vote/delete).
- Keep copy terse + lowercase to match the app's voice ("edit", "delete",
  "u sure?").

## 3. Verify

- Backend: the repo's isolated rig — throwaway `docker run -d -p <port>:5432
  postgres:16`, run the db_ops against it from the `.venv` (`PYTHONPATH=src`,
  set `JWT_SECRET=anything`). Seed two members + a conversation + messages via
  the session factory `db.session.AsyncSessionLocal`; assert edit changes the
  body + author-guard 403s a non-author + delete removes the row + the empty
  conversation is filtered out. (See how the other session's `verify_*.py`
  scripts in the scratchpad are structured — same approach.)
- iOS: `cd ios-v1 && npx tsc --noEmit` — clean except 2 **pre-existing**
  `Reanimated.SharedValue` errors in `Home.tsx` (not yours).

## 4. Coordination (IMPORTANT — parallel session active)

- **Shared hotspot files** the other session is also editing — append, don't
  rewrite; expect to merge: `src/api/main.py`, `src/db/models.py`,
  `src/db/db_manager.py`, `ios-v1/src/api/index.ts`, `ios-v1/src/api/types.ts`.
  Your **exclusive** files: `src/db/db_ops/messages.py`,
  `ios-v1/src/screens/ConversationThread.tsx`, `ios-v1/src/screens/Messages.tsx`.
- **Migrations**: you own **024**. New tables ride `create_all`; new columns on
  existing tables need the idempotent `ALTER ... IF NOT EXISTS` guard in
  `db_manager.run_migrations()` (the numbered `.sql` files are paper-trail only).
- **Git / deploy / OTA — do NOT do these unilaterally.** Standing rule: explicit
  per-action go-ahead from Charlie for every commit / push / migration / OTA.
  No `Co-Authored-By: Claude` trailer. Best flow: hand your finished diff back so
  the other session integrates it into the **single** combined push + one OTA
  (the production EAS channel is shared — two publishers clobber each other; the
  last OTA shipped **1.0.4 only**).
- **Pi**: prod backend is `quentin@192.168.86.92` (NOT .0.127 — that times out);
  `docker compose` there; postgres user `painting-admin`, db `painting-club`;
  api bind-mounts `src/` with `--reload`, so a `git pull` on the Pi hot-reloads +
  runs `create_all` + `run_migrations()`.

## 5. FYI — datetime gotcha the other session just hit

The observability ingest was 500ing because the client sent `new
Date().toISOString()` (a `...Z`, offset-**aware** timestamp) into a naive
`DateTime` column. If any of your message work sends a client timestamp to the
server, normalize to naive UTC (`dt.replace(tzinfo=None)`) or the column will
reject it the same way. (For `edited_at`, just use server `datetime.utcnow()` —
don't take it from the client.)
