/**
 * Returns the base URL for all /api/* calls.
 * In production the new UI project (automating-google-ads) proxies to
 * ua-automation-lac which has all the data and working connections.
 * Override via NEXT_PUBLIC_API_BASE env var.
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ?? "";
