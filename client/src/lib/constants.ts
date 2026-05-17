/**
 * Shared constants used across forms and components.
 */

/** Standard industry sectors available for placement */
export const INDUSTRY_SECTORS = [
  "Information Technology",
  "Manufacturing",
  "Agriculture",
  "Construction",
  "Healthcare",
  "Hospitality",
] as const;

export type IndustrySector = (typeof INDUSTRY_SECTORS)[number];
