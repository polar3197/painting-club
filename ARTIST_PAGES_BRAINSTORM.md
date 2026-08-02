# Artist pages — brainstorm (2026-07-23)

Charlie's ask: the "celebrity" accounts (Townes Van Zandt, Diebenkorn, Brody)
prove people want profiles for artists who aren't members. Make that a real
class: **a new kind of profile, user-creatable, that homes external art** —
preferably a clean child of a larger DB entity that's parent to both real
members and these pages.

## Where the schema is today

- `member` is THE identity: `username` (unique), `password_hash NOT NULL`,
  role, bio/pics/colors. Everything FKs it: `art.creator_id`,
  `media_members`, comments, bookmarks, messages, events, …
- The celebrities are ordinary `member` rows with passwords someone manages —
  their "external" pieces are ordinary `art` rows. This is the load-bearing
  observation: **the entire app already works when an outside artist is a
  profile that owns art** — grids, thumbs, carousel, search, the web.
- `external_art` (#10, just shipped) is the other current home for outside
  pieces: a flat catalog row (artist string, title, image) with NO profile,
  reachable only through the inspiration web.

So today outside art has two homes, both wrong: fake members (right UX,
wrong identity model — they have passwords, count as members) and
`external_art` (right identity model, no UX — no page, no grouping).
Artist pages unify them.

## Recommended shape: thin `profile` parent (Option D)

Joined-table inheritance like `art`/`visual_2d`, but with a **thin parent** —
identity only, children own their shapes:

```
profile                      -- the parent entity
  id          UUID PK
  kind        VARCHAR(20)    -- 'member' | 'artist_page'   (discriminator)
  created_at  TIMESTAMP

member (child, id FK -> profile.id)      -- exactly today's columns
artist_page (child, id FK -> profile.id)
  name        VARCHAR(255)   -- "Ferdinand Hodler"
  bio         TEXT NULL
  profile_pic_path, profile_colors, …    -- reuse member's presentation ideas
  created_by  UUID FK member(id)         -- provenance: who made the page
  kind_hint   VARCHAR(30) NULL           -- 'painter' | 'musician' | … (later)
```

**The critical migration decision: which FKs repoint to `profile`?** Only the
tables an artist page actually needs:

- `art.creator_id` → `profile(id)` — pages own art.
- `media_members.member_id` → `profile(id)` — pages get medium tabs.

Everything *social* (comments, bookmarks, messages, events, reports, blocks,
usage) stays FK'd to `member` — pages can't comment, DM, or bookmark, and the
schema says so. That containment is what makes this migration feasible on
prod: two FK repoints + a backfill (`INSERT INTO profile SELECT id, 'member',
created_at FROM member` — children keep their UUIDs), not a big-bang rewire
of every table.

Why not the alternatives:
- **Single-table** (nullable `password_hash` + kind column on `member`):
  cheapest migration, and the celebrity precedent shows it works — but it's
  exactly the modeling debt Charlie wants out of ("clean child of a larger
  entity"), and every auth/role query has to remember to exclude pages.
- **Fat parent** (move username/bio/pic up to `profile`): conceptually pretty,
  but forces a column migration of member's profile fields plus churn in every
  profile serializer, for no behavior we need. Thin parent gets the clean
  hierarchy without touching member's shape.

## The unification play: external pieces become art owned by pages

Once `art.creator_id` can point at an artist page, an outside piece is just an
`art`/`visual_2d` row created *on* that page. Everything works for free:
thumbs + the new display derivative, profile grid, zoom carousel, search,
series/albums (a Hodler page can have a "landscapes" series!), and — the part
that ties into Stream WEB — **web nodes**. `WebNodeExternal` stops being a
special case: an external piece is an art node whose creator is a page.

Migration path for the two current homes:
1. **Celebrities:** flip their `profile.kind` to `artist_page`, move their
   member row's presentation fields into an `artist_page` row, delete the
   member child row (login dies — nobody should be logging in as Townes).
   Their art rows don't move at all.
2. **`external_art` catalog (the 5 seeded pieces):** auto-create pages from
   distinct artists, convert each catalog row to an art row on its page,
   rewrite `inspiration.to_external_id` → `to_art_id`, drop the gold-ring
   special-casing… **eventually**. Keep `external_art` + the two-FK edge shape
   until pages ship; the CHECK-constraint design means dropping the external
   leg later is one column + one code path, not a data model rethink.

(UI affordance to keep: the gold ring. It should mean "this profile/piece is
outside the club" — driven by `kind`, not by which table the row lives in.)

## Product questions to settle before spec-ing

1. **Shared or per-creator pages?** One club-wide "Ferdinand Hodler" everyone
   adds pieces to (needs dedup-by-name + shared curation rules), or each
   member curates their own pages (simpler, but N Hodlers)? Lean shared —
   it matches the club ethos and the web already treats externals as shared.
2. **Who edits?** Creator + contributors? Anyone can *add pieces* to a page
   but only creator/contributors edit bio/pic? Per-piece provenance ("added
   by charlie") mostly answers moderation.
3. **Where do pages surface?** People tab with the gold ring? Separate
   "artists" shelf? Search results mixed in?
4. **Can a page's piece take comments/bookmarks?** Bookmarks probably yes
   (they're the viewer's, not the page's). Comments feel wrong on a dead
   artist's piece — maybe `comments_enabled=false` forced.
5. **Musicians/writers too?** The schema above is medium-agnostic (pages get
   media tabs), so Townes can have audio. Decide whether v1 limits to visual.
6. **Naming.** "artist page" / "artist profile" / "homage"? Affects routes.

## Rough sequencing (each step deployable alone)

1. `profile` parent + backfill + repoint the two FKs (pure migration, zero
   behavior change; the API keeps treating everything as members).
2. `artist_page` child + CRUD routes + celebrity conversion (their profiles
   keep working, logins retired).
3. Page UI: create/edit page, add pieces to a page (reuses upload pipeline).
4. Fold `external_art` into page-owned art; simplify the inspiration web's
   external leg.

Steps 1–2 are backend-only and low-risk; 3 is the real FE work; 4 is cleanup.
