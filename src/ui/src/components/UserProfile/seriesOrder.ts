import { Visual2DOut } from "../../api";

// Visual pieces carry series membership (the web Visual2DOut type predates it).
export type SeriesPiece = Visual2DOut & { series_id?: string | null; series_name?: string | null; order_index?: number | null };

/** A series' pieces in their explicit order (order_index), then fetch order. */
export const seriesOrder = (pieces: SeriesPiece[]) =>
  [...pieces].sort((a, b) => (a.order_index ?? Number.MAX_SAFE_INTEGER) - (b.order_index ?? Number.MAX_SAFE_INTEGER));
