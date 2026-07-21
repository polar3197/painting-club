# Stream B — questions / approvals needed

## 1. (BLOCKING) Approve the push + deploy — NOW SHIPS BOTH STREAMS

**Update:** Stream A finished and merged to local main (`7f996c0`), so I merged
main into `stream-b` (merge commit `686a3ba`) and re-verified the **combined**
backend on a fresh throwaway postgres: **41 Stream B checks + 22 Stream A
checks (bookmarks, events visibility rules, media-tab order) — all 63 green**,
migrations idempotent, backfill confirmed. `stream-b` is now strictly ahead of
main, so pushing it to main is a clean fast-forward carrying BOTH streams.

I need your go-ahead for exactly:

```
git push -u origin stream-b        # publish the branch
git push origin stream-b:main      # fast-forward origin/main = both streams merged
ssh quentin@192.168.86.92 'cd ~/painting-club && git pull'   # deploy; api hot-reloads
```

Then I'll verify live on the Pi: migrations applied (013-017 paper trails,
016/017 live guards), the aspect_ratio backfill count in the api logs, and
smoke-test the new endpoints (suggestions, covers, bookmarks, events).

Note: this also ships the 3 older unpushed main commits (6d88ddd, 6cd141b =
media-request `requested_type` migration 012, d67d37c) — that's item #5 in
PENDING_BACKEND_CHANGES.md and is intended.

## 2. (fyi, resolved-by-assumption) Goal wording

The goal said "complete stream A" but the questions doc it named is
STREAM_B_qs.md and you'd assigned me Stream B just before — I proceeded with
**Stream B**. Flag me if that was wrong.

---

# Stream B status (no input needed — for reference)

| Item | Status |
|---|---|
| #9 weekly-prompt suggestions + admin queue | ✅ implemented + tested (17 checks) |
| #8 written-piece cover image | ✅ implemented + tested (14 checks) |
| #4 duplicate-email approval → orphan reuse + 409 | ✅ implemented + tested (9 checks) |
| #2 aspect_ratio startup backfill | ✅ implemented + verified (ratio filled, PDF skipped) |
| #3 written-form in /art/search | ⏭ skipped per doc (optional; client fan-out works) |

Bonus fix found by testing: `db_complete_setup` 500'd (MultipleResultsFound)
when two applications link one member — exactly the state orphan-reuse creates;
it now resolves all linked applications. Also fixed a polymorphic-query bug in
`db_remove_written_form` (base+subclass join duplicated rows).

New endpoints (backend-only; FE designs deliberately deferred):
- `POST /weekly-prompts/suggestions` `{prompt_text, media_id?}` (auth)
- `GET /admin/weekly-prompts` → `{proposed[], up_next[]}` (admin)
- `PATCH /admin/weekly-prompts/reorder` `{suggestion_ids[]}` (admin)
- `PATCH /admin/weekly-prompts/{id}` `{status: approved|rejected}` (admin)
- written-form create/update now accept multipart `cover` (+ `clear_cover`);
  `WrittenFormOut.cover_image_path`
