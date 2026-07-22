// Inspiration web data layer — the PERMANENT interface.
//
// Phase 0 (now): every function delegates to inspirationMock (in-memory,
// seeded from real loaded art) because the Pi backend is unreachable for
// migrations. Phase 1: replace the bodies with fetches to
//   GET  /art/{id}/web?depth=2
//   POST /inspirations            DELETE /inspirations/{id}
//   GET  /external-art?q=         POST /external-art (multipart)
// The types and signatures here must NOT change — WebScreen and the
// connect/create dialog are built against them.

import * as mock from './inspirationMock';

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
  // Bundled require() number (seed nodes) or a picked/uploaded uri.
  image: number | { uri: string };
};

export type WebNode = WebNodeArt | WebNodeExternal;

// from = the inspired (in-club) piece; to = its inspiration (art or external).
export type WebEdge = { id: string; from: string; to: string };

export type WebGraph = { focusId: string; nodes: WebNode[]; edges: WebEdge[] };

/** Who is browsing — decides which nodes are editable (`mine`). */
export function setInspirationViewer(username: string | null): void {
  mock.setViewer(username);
}

/** Ensure a piece is known to the graph before opening its web. */
export function registerArt(node: WebNodeArt): void {
  mock.registerArt(node);
}

/** Neighborhood subgraph around a node, `depth` hops in both directions. */
export function getWeb(artId: string, depth: number = 2): Promise<WebGraph> {
  return mock.getWeb(artId, depth);
}

export function addInspiration(fromArtId: string, toNodeId: string): Promise<WebEdge> {
  return mock.addInspiration(fromArtId, toNodeId);
}

export function removeInspiration(edgeId: string): Promise<void> {
  return mock.removeInspiration(edgeId);
}

/** Search club art + the external catalog together (connect pane). */
export function searchLinkTargets(q: string): Promise<WebNode[]> {
  return mock.searchLinkTargets(q);
}

export function createExternalArt(input: {
  artist: string;
  title?: string;
  imageUri: string;
}): Promise<WebNodeExternal> {
  return mock.createExternalArt(input);
}
