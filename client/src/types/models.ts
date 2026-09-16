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
  idmsLearnerId?: string;
  idmsProgrammeId?: string;
  idmsAcademicStatus?: string;
  recordSource?: 'Manual' | 'CSV' | 'IDMS';
  lastIdmsSyncAt?: string;
  idmsSyncStatus?: 'Linked' | 'Conflict' | 'Error';
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
    windowOverrideAllowed?: boolean;
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
  coordinates?: { lat?: number; lng?: number };
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

/** Student placement vacancy advertised by an industry partner */
export interface Vacancy {
  _id: string;
  partner: IndustryPartner;
  title: string;
  program: string;
  tradeArea?: string;
  description: string;
  requirements?: string;
  region: string;
  district?: string;
  location?: string;
  slots: number;
  filledSlots: number;
  applicationDeadline?: string;
  placementStartDate?: string;
  placementEndDate?: string;
  contactEmail?: string;
  contactPhone?: string;
  status: 'Draft' | 'Published' | 'Closed';
  publishedAt?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
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
  idmsInstitutionId?: string;
  idmsInstitutionName?: string;
  idmsSyncEnabled?: boolean;
  lastIdmsSyncAt?: string;
}

/** Populated learner object in initialData (when the backend populates the reference) */
export interface PopulatedLearner {
  _id: string;
  name: string;
  trackingId: string;
}
