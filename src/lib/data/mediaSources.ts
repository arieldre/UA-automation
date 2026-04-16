/**
 * Type definitions for media-source aggregation.
 * Runtime implementation lives in api/lib/mediaSources.js (CJS).
 */

import type { AFChannelMetrics } from '../types';

export interface MediaSourceResult {
  android: Record<string, AFChannelMetrics>;
  ios: Record<string, AFChannelMetrics>;
  gaps: string[];
}
