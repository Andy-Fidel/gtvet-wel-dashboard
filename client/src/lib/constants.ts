/**
 * Shared constants used across forms and components.
 */

/** Standard industry sectors available for placement */
export const INDUSTRY_SECTORS = [
  "Automotive",
  "Construction",
  "Electronics",
  "Government/Public Service",
  "Electrical Engineering/Installation",
  "Fashion & Garment Design",
  "Plumbing",
  "Agriculture",
  "Naval/Maritime",
  "Hospitality - Food/Catering",
  "Printing - Graphics/Media",
  "Public Utilities - Power/Water",
  "Welding & Metal Fabrication",
  "Sanitation & Waste Management",
  "Beauty",
  "Hair/Cosmetology",
  "Education & Training",
  "Hospitality - Hotel/Lodging",
  "Woodwork - Furniture/Carpentry",
  "Refrigeration & Air conditioning",
  "Electronics - Phone/Computer Repair",
  "Health/Medical Services",
] as const;

export type IndustrySector = (typeof INDUSTRY_SECTORS)[number];
