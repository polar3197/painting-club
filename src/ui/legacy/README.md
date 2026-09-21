# Legacy web navigation (archived 2026-09-20)

The web app navigates with a bottom tab bar (`src/components/Pages/TabBar.tsx`:
profile / events / art wall / people); `/home` is the title page.

Archived here, unbuilt and unlinted (outside `src/`, in eslint's ignores):

- `components/Pages/Sidebar.tsx` + `styles/sidebar.css` — the old left sidebar
  (PC / me / people / art / admin / docs).
- `components/Pages/Home.tsx` + `components/Home/{PromptColumn,FeatureBoard,BookShelf}.tsx`
  — the old home page (weekly prompt strip, feature-request board, About
  bookshelf). `EventsBox.tsx` stays in `src/` — the hub's events panel uses it.

Their relative imports assume their original locations under `src/`; move a
file back there to revive it.
- `components/Hub/Hub.tsx` + `styles/hub.css` — the web swipe hub (iOS-style
  4-way cross with seam-riding label bands). Retired 2026-09-20: swipes fought
  panel scrolling in mobile Safari. `ArtWall.tsx` stays in `src/` (the art wall
  tab uses it).
