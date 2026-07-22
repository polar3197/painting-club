// Phase-0 in-memory backend for the inspiration web. Seeds itself from the
// member's real loaded art (search_art) plus one bundled external node (the
// Klimt that already ships as the login background), and fabricates a few
// deterministic seed threads so the demo web isn't empty. Mutations persist
// for the session. Replaced wholesale by real fetches in Phase 1 — see
// inspiration.ts.

import Fuse from 'fuse.js';
import {
  search_art,
  get_media,
  get_members,
  get_members_written_form,
  get_members_audio,
} from '../api';
import type { WebNode, WebNodeArt, WebNodeExternal, WebEdge, WebGraph } from './inspiration';

let viewer: string | null = null;
const nodes = new Map<string, WebNode>();
let edges: WebEdge[] = [];
let seeded = false;
let counter = 0;

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

async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  seeded = true;
  nodes.set(KLIMT.id, KLIMT);
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

    // Deterministic seed threads: a few piece-to-piece chains + two Klimt
    // citations, plus one thread into the written and audio worlds when
    // they exist, so first open shows a real cross-medium web.
    const ids = visual.map((a) => a.id);
    const link = (from?: string, to?: string) => {
      if (!from || !to || from === to) return;
      edges.push({ id: `e${++counter}`, from, to });
    };
    link(ids[1], ids[0]);
    link(ids[2], ids[0]);
    link(ids[3], ids[1]);
    link(ids[5], ids[4]);
    link(ids[6], ids[4]);
    link(ids[8], ids[7]);
    link(ids[0], KLIMT.id);
    link(ids[4], KLIMT.id);
    link(ids[9], KLIMT.id);
    // The club has no written/audio pieces yet (members declare the media
    // but haven't posted) — fabricate one of each so the demo shows the
    // cross-medium rendering. Clearly labeled; gone in Phase 1.
    if (!writtenIds.length) {
      writtenIds.push('demo-written');
      registerArt({
        kind: 'art', id: 'demo-written', title: 'ode to the fog (demo)',
        creator: 'paint club', medium: 'poetry', file_path: '',
        aspect_ratio: null, mine: false, artKind: 'written',
      });
    }
    if (!audioIds.length) {
      audioIds.push('demo-audio');
      registerArt({
        kind: 'art', id: 'demo-audio', title: 'fog song (demo)',
        creator: 'paint club', medium: 'song', file_path: '',
        aspect_ratio: null, mine: false, artKind: 'audio',
      });
    }
    link(ids[0], writtenIds[0]);
    link(ids[1], audioIds[0]);
  } catch {
    // Offline / auth hiccup: the web still works for registered entry nodes.
  }
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
  const edge: WebEdge = { id: `e${++counter}`, from: fromArtId, to: toNodeId };
  edges.push(edge);
  return edge;
}

export async function removeInspiration(edgeId: string): Promise<void> {
  edges = edges.filter((e) => e.id !== edgeId);
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
    id: `ext-${++counter}`,
    artist: input.artist,
    title: input.title || null,
    image: { uri: input.imageUri },
  };
  nodes.set(node.id, node);
  return node;
}
