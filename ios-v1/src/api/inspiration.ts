// Inspiration web data layer — the PERMANENT interface, now Phase 1: every
// function talks to the real backend (migration 025 + /inspirations routes).
// The types and signatures here must NOT change — WebScreen and the
// connect/create dialog are built against them.

import * as SecureStore from 'expo-secure-store';
import { request, authHeaders } from './client';

// Mirrors client.ts (which keeps API_BASE private).
const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:80/api';

// Phase-0's on-device demo links are obsolete — the web is server-truth now.
// Clear the old key once so stale mock ids can never resurface.
SecureStore.deleteItemAsync('inspiration_demo_state_v1').catch(() => {});

export type WebNodeArt = {
  kind: 'art';
  id: string;
  title: string;
  creator: string;
  medium: string;
  file_path: string;
  aspect_ratio: number | null;
  mine: boolean;
  // Which club medium family this piece belongs to — decides how its node
  // renders (image thumb / paper page / music note). Backend-wise all three
  // share the base art table, so inspiration edges don't care.
  artKind: 'visual' | 'written' | 'audio';
};

export type WebNodeExternal = {
  kind: 'external';
  id: string;
  artist: string;
  title: string | null;
  // The member-gated image route (bearer in headers — a bare <Image> GET
  // carries no token of its own). `number` survives from the bundled-asset
  // era so old call sites still typecheck.
  image: number | { uri: string; headers?: Record<string, string> };
};

export type WebNode = WebNodeArt | WebNodeExternal;

// from = the inspired (in-club) piece; to = its inspiration (art or external).
export type WebEdge = { id: string; from: string; to: string };

export type WebGraph = { focusId: string; nodes: WebNode[]; edges: WebEdge[] };

type ServerNode =
  | {
      kind: 'art';
      id: string;
      title: string | null;
      creator: string;
      medium: string;
      file_path: string;
      aspect_ratio: number | null;
      mine: boolean;
      artKind: 'visual' | 'written' | 'audio';
    }
  | { kind: 'external'; id: string; artist: string; title: string | null; image_path: string };

/** URL of an external piece's gated image route — thumb by default, the
 *  full-size original with `full` (the caption-tap zoom view). Callers must
 *  attach `authHeaders()`. */
export function externalImageUrl(id: string, full: boolean = false): string {
  return `${API_BASE}/external-art/${id}/image${full ? '?full=1' : ''}`;
}

function externalImageSource(id: string): { uri: string; headers?: Record<string, string> } {
  return { uri: externalImageUrl(id), headers: authHeaders() };
}

function toNode(n: ServerNode): WebNode {
  if (n.kind === 'external') {
    return { kind: 'external', id: n.id, artist: n.artist, title: n.title, image: externalImageSource(n.id) };
  }
  return { ...n, title: n.title ?? '' };
}

function toGraph(g: { focusId: string; nodes: ServerNode[]; edges: WebEdge[] }): WebGraph {
  return { focusId: g.focusId, nodes: g.nodes.map(toNode), edges: g.edges };
}

/** Who is browsing — the backend derives `mine` from the bearer token now,
 *  so this is a no-op kept for its frozen signature. */
export function setInspirationViewer(_username: string | null): void {}

/** Ensure a piece is known to the graph before opening its web. The backend
 *  always includes the focus node in GET /art/{id}/web, so this is a no-op
 *  kept for its frozen signature. */
export function registerArt(_node: WebNodeArt): void {}

/** Neighborhood subgraph around a node, `depth` hops in both directions. */
export async function getWeb(artId: string, depth: number = 2): Promise<WebGraph> {
  const g = (await request(`/art/${artId}/web?depth=${depth}`)) as any;
  return toGraph(g);
}

/**
 * The entire web at once — every piece that has at least one connection
 * (singletons excluded), across all disconnected clusters. `focusId` is ''
 * (no single center).
 */
export async function getFullWeb(): Promise<WebGraph> {
  const g = (await request('/inspirations/web')) as any;
  return toGraph(g);
}

export async function addInspiration(fromArtId: string, toNodeId: string): Promise<WebEdge> {
  // to_node_id is the untyped target — the server resolves whether it's a
  // club piece or an external one (this signature doesn't carry the kind).
  return (await request('/inspirations', {
    method: 'POST',
    body: JSON.stringify({ from_art_id: fromArtId, to_node_id: toNodeId }),
  })) as WebEdge;
}

export async function removeInspiration(edgeId: string): Promise<void> {
  await request(`/inspirations/${edgeId}`, { method: 'DELETE' });
}

/** Search club art + the external catalog together (connect pane). */
export async function searchLinkTargets(q: string): Promise<WebNode[]> {
  const nodes = (await request(`/inspirations/search-targets?q=${encodeURIComponent(q)}`)) as ServerNode[];
  return nodes.map(toNode);
}

export async function createExternalArt(input: {
  artist: string;
  title?: string;
  imageUri: string;
}): Promise<WebNodeExternal> {
  const fd = new FormData();
  fd.append('artist', input.artist);
  if (input.title) fd.append('title', input.title);
  if (input.imageUri.startsWith('blob:') || input.imageUri.startsWith('data:')) {
    // Web: picked images arrive as blob:/data: URIs — send the bytes.
    const blob = await (await fetch(input.imageUri)).blob();
    fd.append('file', blob, 'external.jpg');
  } else {
    const ext = input.imageUri.split('.').pop()?.toLowerCase() ?? 'jpg';
    fd.append('file', {
      uri: input.imageUri,
      name: `external.${ext === 'png' ? 'png' : 'jpg'}`,
      type: ext === 'png' ? 'image/png' : 'image/jpeg',
    } as any);
  }
  const node = (await request('/external-art', { method: 'POST', body: fd })) as ServerNode;
  return toNode(node) as WebNodeExternal;
}
