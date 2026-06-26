export interface SimpleLearner {
  _id: string;
  name: string;
  program: string;
  status: string;
  region: string;
  placement?: {
    location: string;
  };
}

export interface DashboardStats {
  totalLearners: number;
  placed: number;
  pending: number;
  totalVisits: number;
  genderDistribution?: { gender: string; count: number }[];
  academicSummary?: {
    currentEnrolled: number;
    active: number;
    graduating: number;
    graduated: number;
    dropped: number;
  };
  intakeCohorts?: {
    intakeAcademicYear: string;
    totalLearners: number;
    currentEnrolled: number;
    graduating: number;
    graduated: number;
    placementRate?: number;
    dropRate?: number;
    riskLevel?: string;
    riskReasons?: string[];
    regionCount?: number;
    institutionCount?: number;
  }[];
  monthlyStats: { name: string; total: number }[];
  recentPlacements: SimpleLearner[];
  institutionPerformance?: {
    placementCoverageRate: number;
    activeLearnerCount: number;
    overdueAttendanceRate: number;
    monitoringCoverageRate: number;
    assessmentCompletionRate: number;
    supportBacklog: number;
    slaBreachCount: number;
  };
}

export interface ApprovalQueueItem {
  _id: string;
  institution: string;
  title: string;
  status: string;
  createdAt: string;
  ageDays: number;
}

export interface SupportQueueItem {
  _id: string;
  subject: string;
  priority: string;
  status: string;
  institution: string;
  region: string;
  requesterName: string;
  createdAt: string;
  updatedAt: string;
  replyCount: number;
}

export interface SensitiveEvent {
  _id: string;
  action: string;
  entityType: string;
  summary: string;
  actorName: string;
  actorRole: string;
  institution: string;
  createdAt: string;
}

export interface RegionalStat {
  region: string;
  totalLearners: number;
  currentEnrolled: number;
  academicGraduated: number;
  placed: number;
  completed: number;
  institutionCount: number;
  placementRate: number;
  completionRate: number;
  currentSemesterPlacements: number;
  previousSemesterPlacements: number;
  semesterOverSemesterDelta: number;
  semesterOverSemesterPercent: number;
  movementDirection: "up" | "down" | "flat";
  needsIntervention: boolean;
  interventionReasons: string[];
  sparkline: { period: string; count: number }[];
}

export type AdminOverviewStats = DashboardStats & {
  totalInstitutions: number;
  totalUsers: number;
  totalPlacements: number;
  totalVisits: number;
  totalReports: number;
  totalPartners?: number;
  overallPlacementRate: number;
  academicSummary?: {
    currentEnrolled: number;
    active: number;
    graduating: number;
    graduated: number;
    dropped: number;
  };
  intakeCohorts?: {
    intakeAcademicYear: string;
    totalLearners: number;
    currentEnrolled: number;
    graduating: number;
    graduated: number;
    regionCount: number;
    institutionCount: number;
    riskLevel?: string;
    riskReasons?: string[];
  }[];
  regionalCohortBreakdown?: {
    region: string;
    intakeAcademicYear: string;
    totalLearners: number;
    currentEnrolled: number;
    graduating: number;
    graduated: number;
    institutionCount: number;
  }[];
  institutionCohortBreakdown?: {
    institution: string;
    region: string;
    intakeAcademicYear: string;
    totalLearners: number;
    currentEnrolled: number;
    graduating: number;
    graduated: number;
  }[];
  placementTrend: { name: string; year: number; month: number; count: number }[];
  regionalStats: RegionalStat[];
  institutionStats: {
    _id: string;
    totalLearners: number;
    currentEnrolled: number;
    academicActive: number;
    academicGraduating: number;
    academicGraduated: number;
    placed: number;
    pending: number;
    completed: number;
    dropped: number;
  }[];
  genderDistribution: { gender: string; count: number }[];
  programDistribution: { program: string; count: number }[];
  learnerProgressSummary?: {
    totalLearners: number;
    averageProgress: number;
    atRiskCount: number;
    completedCount: number;
    placedCount: number;
    ownershipSummary: {
      assignedCount: number;
      unassignedCount: number;
      atRiskOwnedCount: number;
    };
  };
  learnerQualitySummary?: {
    activeLearnerCount: number;
    overdueAttendanceRate: number;
    monitoringCoverageRate: number;
    gpsVerifiedRate: number;
    avgVisitRating: number;
    assessmentCompletionRate: number;
    avgAssessmentScore: number;
    employerEvaluationCoverageRate: number;
    avgEmployerScore: number;
    wouldHireRate: number;
    assessmentScoreTrend: { name: string; count: number; avgScore: number }[];
    employerOutcomeTrend: { name: string; count: number; avgScore: number; wouldHireRate: number }[];
  };
  pendingReports: number;
  reportPipeline: { status: string; count: number }[];
  approvalInbox?: {
    pendingCount: number;
    overdueCount: number;
    recentRejectedCount: number;
    queue: ApprovalQueueItem[];
  };
  supportSummary?: {
    total: number;
    open: number;
    inProgress: number;
    urgentOpen: number;
    oldestOpenAgeDays: number;
    categoryBreakdown: { category: string; count: number }[];
    regionBreakdown: { region: string; count: number }[];
    queue: SupportQueueItem[];
  };
  auditSummary?: {
    eventsLast7Days: number;
    destructiveEventsLast7Days: number;
    authEventsLast7Days: number;
    statusChangesLast7Days: number;
    topActors: { actorId?: string; actorName: string; actorRole: string; count: number }[];
    recentSensitiveEvents: SensitiveEvent[];
  };
  dataQualityAlerts?: {
    stalePendingLearners: number;
    placementsMissingSupervisor: number;
    pendingAttendanceSignOff: number;
    activePlacementsWithoutVisits: number;
  };
  userGovernance?: {
    inactiveUsers: number;
    pendingPasswordResets: number;
    institutionsWithoutActiveAdmins: { _id: string; name: string; region: string; code: string }[];
    privilegedUserAnomalies: {
      institution: string;
      adminCount: number;
      managerCount: number;
      privilegedCount: number;
      activePrivilegedCount: number;
      reasons: string[];
    }[];
    roleBreakdown: { role: string; count: number }[];
  };
  deadlineRisk?: {
    upcomingDeadlines: {
      _id: string;
      title: string;
      startDate: string;
      endDate: string;
      semester: string;
      academicYear: string;
      description: string;
      daysRemaining: number;
    }[];
    currentCycle: {
      title: string;
      semester: string;
      academicYear: string;
      endDate: string;
      daysRemaining: number;
      isOverdue: boolean;
    } | null;
    overdueInstitutionSubmissions: {
      _id: string;
      institution: string;
      region: string;
      status: string;
      code: string;
    }[];
    atRiskInstitutions: {
      _id: string;
      institution: string;
      region: string;
      status: string;
      code: string;
      daysRemaining: number;
    }[];
  };
};
