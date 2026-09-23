import { createContext } from 'react';

// A hub page's own inner scroller (e.g. the prompt image column) calls this to
// temporarily lock the hub's vertical pager while it's being touched, so its
// scroll doesn't bubble into a jump back to Home. Margin swipes (outside that
// scroller) never call it, so they still page Home normally. No-op outside the
// hub.
export const HubPagerLock = createContext<(locked: boolean) => void>(() => {});
