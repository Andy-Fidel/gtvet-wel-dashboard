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
  institution?: string;
  indexNumber?: string;
  dateOfBirth?: string;
  program?: string;
  phone?: string;
  year?: string;
  status?: string;
  academicStatus?: string;
  region?: string;
  hasActivePlacement?: boolean;
  readiness?: {
    isReadyForPlacement: boolean;
    missingFields: string[];
    missingDocuments: string[];
    documentCount: number;
  };
  placementEligibility?: {
    isEligible: boolean;
    reason: string;
    allowedWindowStatus?: string | null;
    calendarType?: string | null;
    yearGroup?: string;
    schedule?: {
      semester?: string;
      academicYear?: string;
      startDate?: string;
      endDate?: string;
      totalWeeks?: number | null;
      institutionCalendarType?: string | null;
    } | null;
  };
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
  approvalStatus?: 'PendingHQApproval' | 'Approved' | 'Rejected';
  approvalRequestedAt?: string;
  approvalReviewedAt?: string;
  approvalComment?: string;
  programs: string[];
}

/** Institution entity */
export interface Institution {
  _id: string;
  name: string;
  code: string;
  region: string;
  calendarType?: string;
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
