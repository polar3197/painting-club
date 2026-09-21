# Legacy web navigation (archived 2026-09-20)

The web app now navigates exclusively through the swipe hub at `/home`
(`src/components/Hub/Hub.tsx`), the same model as the iOS app. Pages outside
the hub get a green "home" band on their left edge (`PageLayout.tsx`).

Archived here, unbuilt and unlinted (outside `src/`, in eslint's ignores):

- `components/Pages/Sidebar.tsx` + `styles/sidebar.css` — the old left sidebar
  (PC / me / people / art / admin / docs).
- `components/Pages/Home.tsx` + `components/Home/{PromptColumn,FeatureBoard,BookShelf}.tsx`
  — the old home page (weekly prompt strip, feature-request board, About
  bookshelf). `EventsBox.tsx` stays in `src/` — the hub's events panel uses it.

Their relative imports assume their original locations under `src/`; move a
file back there to revive it.
