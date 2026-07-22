// Phase-0 backend for the inspiration web, shipping OTA until the Pi is
// reachable for the real one. Two kinds of demo data, both erased in Phase 1:
//
// 1. CURATED SEED THREADS (code, below): hand-picked example connections
//    between real club pieces, matched by title so they survive re-seeding
//    on every launch. Delete the CURATED_LINKS table to erase.
// 2. MEMBER-MADE DEMO LINKS: anything the club wires up in the demo persists
//    on-device (SecureStore key DEMO_STATE_KEY) across restarts. Clearing
//    that key — or Phase 1 simply ignoring it — erases them.
//
// Replaced wholesale by real fetches in Phase 1 — see inspiration.ts.

import Fuse from 'fuse.js';
import * as SecureStore from 'expo-secure-store';
import {
  search_art,
  get_media,
  get_members,
  get_members_written_form,
  get_members_audio,
} from '../api';
import type { WebNode, WebNodeArt, WebNodeExternal, WebEdge, WebGraph } from './inspiration';

// Wipe this key in Phase 1 to erase all member-made demo links/externals.
const DEMO_STATE_KEY = 'inspiration_demo_state_v1';

type DemoState = {
  // user-added edges as [from, to]
  e: [string, string][];
  // user-created externals
  x: { id: string; artist: string; title: string | null; uri: string }[];
  // removed edge ids (covers seed edges too, so deletions stick)
  r: string[];
};

let demoState: DemoState = { e: [], x: [], r: [] };

function saveDemoState() {
  SecureStore.setItemAsync(DEMO_STATE_KEY, JSON.stringify(demoState)).catch(() => {});
}

let viewer: string | null = null;
const nodes = new Map<string, WebNode>();
let edges: WebEdge[] = [];
let seeded = false;

export function setViewer(username: string | null) {
  viewer = username;
  // `mine` was computed against the old viewer; recompute on art nodes.
  for (const n of nodes.values()) {
    if (n.kind === 'art') n.mine = n.creator === viewer;
  }
}

export function registerArt(node: WebNodeArt) {
  const existing = nodes.get(node.id);
  if (existing && existing.kind === 'art') {
    // Merge, preferring defined incoming fields — an entry point with partial
    // info (e.g. the profile page) must not clobber seeded data, and seeding
    // must be able to fill blanks left by an early partial registration.
    const merged: WebNodeArt = {
      ...existing,
      title: node.title ?? existing.title,
      creator: node.creator ?? existing.creator,
      medium: node.medium ?? existing.medium,
      file_path: node.file_path ?? existing.file_path,
      aspect_ratio: node.aspect_ratio ?? existing.aspect_ratio,
      mine: false,
    };
    merged.mine = merged.creator === viewer;
    nodes.set(node.id, merged);
    return;
  }
  nodes.set(node.id, { ...node, mine: node.creator === viewer });
}

const KLIMT: WebNodeExternal = {
  kind: 'external',
  id: 'ext-klimt',
  artist: 'Gustav Klimt',
  title: 'Litzlberg am Attersee',
  image: require('../../assets/imgs/klimpt.png'),
};

// External pieces Charlie authored in the demo, images bundled so they ship
// with the OTA (the originals were session-local file picks).
const BUNDLED_EXTERNALS: WebNodeExternal[] = [
  KLIMT,
  {
    kind: 'external',
    id: 'ext-hodler-kien-valley',
    artist: 'Ferdinand Hodler',
    title: 'The Kien Valley with the Bluemlisalp Massif',
    image: require('../../assets/imgs/externals/hodler-kien-valley.jpg'),
  },
  {
    kind: 'external',
    id: 'ext-avery-dune-and-sea-ii',
    artist: 'Milton Avery',
    title: 'Dune and Sea II',
    image: require('../../assets/imgs/externals/avery-dune-and-sea-ii.jpg'),
  },
  {
    kind: 'external',
    id: 'ext-porter-plane-tree',
    artist: 'Fairfield Porter',
    title: 'Plane Tree',
    image: require('../../assets/imgs/externals/porter-plane-tree.jpg'),
  },
  {
    kind: 'external',
    id: 'ext-manet-the-railway',
    artist: 'Manet',
    title: 'The Railway',
    image: require('../../assets/imgs/externals/manet-the-railway.jpg'),
  },
];

async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  seeded = true;
  // Member-made demo links persisted on this device (see header note).
  try {
    const raw = await SecureStore.getItemAsync(DEMO_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      demoState = {
        e: Array.isArray(parsed.e) ? parsed.e : [],
        x: Array.isArray(parsed.x) ? parsed.x : [],
        r: Array.isArray(parsed.r) ? parsed.r : [],
      };
    }
  } catch {
    // Corrupt/absent state: start clean.
  }
  for (const ext of BUNDLED_EXTERNALS) nodes.set(ext.id, ext);
  try {
    const art = await search_art('');
    const visual = art.filter((a) => a.art_type !== 'written_form').slice(0, 14);
    for (const a of visual) {
      registerArt({
        kind: 'art',
        id: a.id,
        title: a.title,
        creator: a.creator_username,
        medium: a.medium,
        file_path: a.file_path,
        aspect_ratio: a.aspect_ratio,
        mine: a.creator_username === viewer,
        artKind: 'visual',
      });
    }

    // Written + audio ride the same per-member fan-out the feed uses (there
    // is no cross-club search endpoint for them). Capped so the demo doesn't
    // hammer the Pi.
    const writtenIds: string[] = [];
    const audioIds: string[] = [];
    try {
      // null token: the request layer attaches the member's default bearer.
      const [media, members] = await Promise.all([get_media(), get_members('', '', null)]);
      const writtenMedia = new Set(media.filter((m) => m.type === 'written_form').map((m) => m.name));
      const audioMedia = new Set(media.filter((m) => m.type === 'audio').map((m) => m.name));
      const jobs: Promise<void>[] = [];
      for (const member of members.slice(0, 12)) {
        for (const medium of member.media ?? []) {
          if (writtenMedia.has(medium)) {
            jobs.push(
              get_members_written_form(member.username, medium)
                .then((pieces) => {
                  for (const p of pieces.slice(0, 3)) {
                    writtenIds.push(p.id);
                    registerArt({
                      kind: 'art',
                      id: p.id,
                      title: p.title,
                      creator: member.username,
                      medium,
                      file_path: p.file_path,
                      aspect_ratio: null,
                      mine: member.username === viewer,
                      artKind: 'written',
                    });
                  }
                })
                .catch(() => {}),
            );
          }
          if (audioMedia.has(medium)) {
            jobs.push(
              get_members_audio(member.username, medium)
                .then((pieces) => {
                  for (const p of pieces.slice(0, 3)) {
                    audioIds.push(p.id);
                    registerArt({
                      kind: 'art',
                      id: p.id,
                      title: p.title,
                      creator: member.username,
                      medium,
                      file_path: p.file_path,
                      aspect_ratio: null,
                      mine: member.username === viewer,
                      artKind: 'audio',
                    });
                  }
                })
                .catch(() => {}),
            );
          }
        }
      }
      await Promise.all(jobs);
    } catch {
      // Written/audio seeding is best-effort — the visual web still works.
    }

    // CURATED SEED THREADS — the connections Charlie authored in the demo,
    // baked in (matched by creator+title so they survive re-seeding on every
    // launch, independent of ids/search order). Erased in Phase 1 when the
    // real backend replaces this mock.
    let seedCounter = 0;
    // Match against the FULL search list (not just the top-14 catalog slice)
    // and register the piece as a node — curated links may cite older pieces.
    const byTitle = (creator: string, title: string): string | undefined => {
      const a = art.find(
        (p) =>
          p.creator_username === creator &&
          (p.title || '').trim().toLowerCase() === title,
      );
      if (!a) return undefined;
      registerArt({
        kind: 'art',
        id: a.id,
        title: a.title,
        creator: a.creator_username,
        medium: a.medium,
        file_path: a.file_path,
        aspect_ratio: a.aspect_ratio,
        mine: a.creator_username === viewer,
        artKind: 'visual',
      });
      return a.id;
    };
    const seedLink = (from?: string, to?: string) => {
      if (!from || !to || from === to) return;
      const id = `seed-${++seedCounter}`;
      if (demoState.r.includes(id)) return; // a member deleted it — stays gone
      if (edges.some((e) => e.from === from && e.to === to)) return;
      edges.push({ id, from, to });
    };
    seedLink(byTitle('charlie', 'bernal hill'), 'ext-hodler-kien-valley');
    seedLink(byTitle('charlie', 'the beach'), 'ext-avery-dune-and-sea-ii');
    seedLink(byTitle('charlie', 'wippets on the couch'), 'ext-porter-plane-tree');
    seedLink(byTitle('charlie', 'wippets on the couch'), 'ext-manet-the-railway');
    void writtenIds;
    void audioIds;

    // Re-apply member-made demo links persisted on this device. Externals
    // saved with blob: URIs are dead (the picked image lived only in that
    // browser session) — drop them and any edges pointing at them; their
    // baked equivalents above carry the connection now.
    const deadExternals = new Set(
      demoState.x.filter((x) => x.uri.startsWith('blob:')).map((x) => x.id),
    );
    for (const x of demoState.x) {
      if (deadExternals.has(x.id)) continue;
      nodes.set(x.id, { kind: 'external', id: x.id, artist: x.artist, title: x.title, image: { uri: x.uri } });
    }
    for (const [from, to] of demoState.e) {
      if (deadExternals.has(to)) continue;
      const id = userEdgeId(from, to);
      if (demoState.r.includes(id)) continue;
      if (nodes.has(from) && nodes.has(to) && !edges.some((e) => e.from === from && e.to === to)) {
        edges.push({ id, from, to });
      }
    }
  } catch {
    // Offline / auth hiccup: the web still works for registered entry nodes.
  }
}

function userEdgeId(from: string, to: string): string {
  return `u-${from}-${to}`;
}

export async function getWeb(artId: string, depth: number): Promise<WebGraph> {
  await ensureSeeded();
  // BFS both directions from the focus.
  const keep = new Set<string>([artId]);
  let frontier = [artId];
  for (let hop = 0; hop < depth; hop++) {
    const next: string[] = [];
    for (const e of edges) {
      if (frontier.includes(e.from) && !keep.has(e.to)) {
        keep.add(e.to);
        next.push(e.to);
      }
      if (frontier.includes(e.to) && !keep.has(e.from)) {
        keep.add(e.from);
        next.push(e.from);
      }
    }
    frontier = next;
  }
  const outNodes: WebNode[] = [];
  for (const id of keep) {
    const n = nodes.get(id);
    if (n) outNodes.push(n);
  }
  return {
    focusId: artId,
    nodes: outNodes,
    edges: edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
  };
}

export async function getFullWeb(): Promise<WebGraph> {
  await ensureSeeded();
  // Only nodes touched by an edge — singletons are excluded by construction.
  const connected = new Set<string>();
  for (const e of edges) {
    connected.add(e.from);
    connected.add(e.to);
  }
  const outNodes: WebNode[] = [];
  for (const id of connected) {
    const n = nodes.get(id);
    if (n) outNodes.push(n);
  }
  return { focusId: '', nodes: outNodes, edges: [...edges] };
}

export async function addInspiration(fromArtId: string, toNodeId: string): Promise<WebEdge> {
  await ensureSeeded();
  const from = nodes.get(fromArtId);
  if (!from || from.kind !== 'art' || !from.mine) {
    throw new Error('you can only add inspirations to your own pieces');
  }
  if (!nodes.has(toNodeId) || fromArtId === toNodeId) {
    throw new Error('unknown target');
  }
  const existing = edges.find((e) => e.from === fromArtId && e.to === toNodeId);
  if (existing) return existing;
  const edge: WebEdge = { id: userEdgeId(fromArtId, toNodeId), from: fromArtId, to: toNodeId };
  edges.push(edge);
  // Persist so the link survives restarts (and can be baked into the seed).
  demoState.e.push([fromArtId, toNodeId]);
  demoState.r = demoState.r.filter((id) => id !== edge.id);
  saveDemoState();
  return edge;
}

export async function removeInspiration(edgeId: string): Promise<void> {
  edges = edges.filter((e) => e.id !== edgeId);
  // Persist the deletion: user edges leave the saved list, seed edges are
  // remembered as removed so they stay gone across restarts.
  demoState.e = demoState.e.filter(([from, to]) => userEdgeId(from, to) !== edgeId);
  if (!demoState.r.includes(edgeId)) demoState.r.push(edgeId);
  saveDemoState();
}

export async function searchLinkTargets(q: string): Promise<WebNode[]> {
  await ensureSeeded();
  const all = Array.from(nodes.values());
  if (!q.trim()) return all.slice(0, 12);
  const fuse = new Fuse(all, {
    keys: ['title', 'creator', 'artist', 'medium'],
    threshold: 0.4,
  });
  return fuse.search(q).map((r) => r.item);
}

export async function createExternalArt(input: {
  artist: string;
  title?: string;
  imageUri: string;
}): Promise<WebNodeExternal> {
  const node: WebNodeExternal = {
    kind: 'external',
    id: `ext-u-${demoState.x.length + 1}-${input.artist.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    artist: input.artist,
    title: input.title || null,
    image: { uri: input.imageUri },
  };
  nodes.set(node.id, node);
  // Persist. Note: on web the picked image is a blob: URI that dies with the
  // session — the node survives but its image needs re-bundling at bake time.
  demoState.x.push({ id: node.id, artist: node.artist, title: node.title, uri: input.imageUri });
  saveDemoState();
  return node;
}
