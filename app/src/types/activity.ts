/**
 * activity.ts
 *
 * Canonical ActivityMessage type for use across all hooks and components.
 * Previously duplicated in ~18 hook files — this is the single source of truth.
 */

export interface ActivityMessage {
  id: string;
  message: string;
  timestamp: number;
  stage?: string;
  isSummary?: boolean;
}
