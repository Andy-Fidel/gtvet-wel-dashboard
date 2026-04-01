/**
 * Shared type definitions for the GTVET WEL Dashboard.
 * Centralizes interfaces that were previously duplicated across form components.
 */

/** Learner entity as returned from the API */
export interface Learner {
  _id: string;
  firstName?: string;
  lastName?: string;
  name: string;
  trackingId: string;
  indexNumber?: string;
  program?: string;
  status?: string;
  region?: string;
}

/** Industry Partner entity */
export interface IndustryPartner {
  _id: string;
  name: string;
  sector: string;
  region: string;
  location?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  website?: string;
  totalSlots: number;
  usedSlots: number;
  status: 'Active' | 'Inactive';
  programs: string[];
}

/** Institution entity */
export interface Institution {
  _id: string;
  name: string;
  code: string;
  region: string;
  type?: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
}

/** Populated learner object in initialData (when the backend populates the reference) */
export interface PopulatedLearner {
  _id: string;
  name: string;
  trackingId: string;
}
