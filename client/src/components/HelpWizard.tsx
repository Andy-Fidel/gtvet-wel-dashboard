import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation } from "react-router-dom"
import { ArrowLeft, ArrowRight, BookOpenText, CircleHelp, Sparkles } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type AppRole = "SuperAdmin" | "RegionalAdmin" | "Admin" | "Manager" | "Staff" | "IndustryPartner" | "Guardian"

type GuideStep = {
  title: string
  description: string
  bullets: string[]
  targetId?: string
  activateTargetId?: string
  activateMode?: "tab" | "dialog"
  includeIfTargetId?: string
}

type GuideDefinition = {
  key: string
  label: string
  launchPath?: string
  catalogSummary?: string
  roles?: AppRole[]
  match: (pathname: string, role?: AppRole) => boolean
  steps: (role?: AppRole) => GuideStep[]
}

export type GuideCatalogItem = {
  key: string
  label: string
  launchPath: string
  catalogSummary: string
  category: "Operations" | "Learners" | "Reporting" | "Governance" | "Partners" | "Personal"
}

const HELP_GUIDE_VERSION = "v1"

const buildProgressKey = (role: string, guideKey: string) => `gtvets-help-guide-progress:${HELP_GUIDE_VERSION}:${role}:${guideKey}`
const buildAutoStartKey = (userId: string) => `gtvets-help-auto-started:${HELP_GUIDE_VERSION}:${userId}`

const INSTITUTION_ROLES: AppRole[] = ["Admin", "Manager", "Staff"]
const INSTITUTION_AND_REGION_ROLES: AppRole[] = ["RegionalAdmin", "Admin", "Manager", "Staff"]
const ADMIN_ROLES: AppRole[] = ["SuperAdmin", "RegionalAdmin", "Admin"]
const ALL_ROLES: AppRole[] = ["SuperAdmin", "RegionalAdmin", "Admin", "Manager", "Staff", "IndustryPartner", "Guardian"]

const guideDefinitions: GuideDefinition[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    launchPath: "/",
    catalogSummary: "Overview cards, trend signals, and shortcuts into daily work queues.",
    roles: ["SuperAdmin", "RegionalAdmin", "Admin", "Manager", "Staff"],
    match: (pathname) => pathname === "/",
    steps: (role) => [
      {
        title: role === "SuperAdmin" ? "HQ Dashboard" : role === "RegionalAdmin" ? "Regional Dashboard" : "Operational Dashboard",
        description: "This page gives you the fastest read on current performance, bottlenecks, and work that needs attention.",
        targetId: "dashboard-overview",
        bullets: [
          "Use summary cards to spot volume, completion, and placement trends quickly.",
          "Open linked sections to move from insight to action without searching the sidebar.",
          "Refresh your understanding here before drilling into learners, reports, or governance workflows.",
        ],
      },
      {
        title: "How To Use It",
        description: "Treat the dashboard as your control panel for daily prioritization.",
        targetId: "dashboard-audit-link",
        bullets: [
          "Review league tables and exception cards to identify weak regions, schools, or workflows.",
          "Use export buttons where available when you need to brief other stakeholders.",
          "Check notifications and support queues from the top bar to catch urgent issues.",
        ],
      },
    ],
  },
  {
    key: "learners",
    label: "Learner Register",
    launchPath: "/learners",
    catalogSummary: "Filter, review, and manage learner records before case-level work.",
    roles: INSTITUTION_ROLES,
    match: (pathname) => pathname === "/learners",
    steps: () => [
      {
        title: "Learner Register",
        description: "This is the working list of learner records for intake, filtering, and bulk review.",
        bullets: [
          "Search and filter to narrow the register by status, institution, or academic context.",
          "Use this page to find learners before opening detailed profile and placement workflows.",
          "Bulk actions and clean filtering help reduce admin time when volumes are high.",
        ],
      },
      {
        title: "Best Next Actions",
        description: "Use the register to keep records clean and move learners forward.",
        bullets: [
          "Open a learner record when you need documents, placement history, or progression detail.",
          "Prioritize incomplete or pending learners so they do not stall downstream reporting.",
          "Return here after edits to validate that the learner appears in the correct state.",
        ],
      },
    ],
  },
  {
    key: "learner-profile",
    label: "Learner Profile",
    roles: INSTITUTION_ROLES,
    match: (pathname) => pathname.startsWith("/learners/"),
    steps: () => [
      {
        title: "Learner Profile",
        description: "This page consolidates one learner’s records, placement journey, and supporting documentation.",
        targetId: "learner-profile-actions",
        bullets: [
          "Review readiness, assessments, attendance, and placement context from one view.",
          "Use profile-level actions when you need to correct or continue a learner workflow.",
          "This is the best page for case-level troubleshooting and auditability.",
        ],
      },
      {
        title: "What To Check First",
        description: "Start with operational blockers before making updates.",
        targetId: "learner-profile-management",
        bullets: [
          "Confirm learner status and academic status align with the latest real-world position.",
          "Review placement and monitoring history before changing anything sensitive.",
          "Use linked reports and forms to keep a clean end-to-end record.",
        ],
      },
      {
        title: "Placement Readiness",
        description: "When a learner cannot be placed yet, this page calls out what is still missing.",
        targetId: "learner-profile-readiness",
        includeIfTargetId: "learner-profile-readiness",
        bullets: [
          "Use the readiness warning to resolve intake gaps before starting a placement.",
          "Missing identity, contact, or document data should be fixed here, not worked around elsewhere.",
          "Treat readiness blockers as upstream issues that will affect placement and reporting later.",
        ],
      },
      {
        title: "Escalate Active Blockers",
        description: "Use the blocker workflow when a live placement issue needs a tracked intervention.",
        targetId: "learner-profile-blocker-form",
        activateTargetId: "learner-profile-open-blocker",
        activateMode: "dialog",
        bullets: [
          "Capture the real operational blocker, not a vague summary.",
          "Choose the right category and priority so the support team can triage correctly.",
          "Use this instead of ad hoc messages when the issue needs ownership and follow-up.",
        ],
      },
    ],
  },
  {
    key: "learner-progress",
    label: "Progress Tracker",
    launchPath: "/learner-progress",
    catalogSummary: "Find at-risk learners and resolve missing milestone inputs.",
    roles: INSTITUTION_ROLES,
    match: (pathname) => pathname === "/learner-progress",
    steps: () => [
      {
        title: "Progress Tracking",
        description: "This workspace highlights learner readiness, progress, and intervention needs.",
        bullets: [
          "Use it to find learners at risk before missed placements become reporting problems.",
          "Compare academic, operational, and documentation signals in one place.",
          "Prioritize by risk rather than by raw list order.",
        ],
      },
      {
        title: "Intervention Workflow",
        description: "Turn the tracker into an action queue.",
        bullets: [
          "Open the learner or source page behind each issue and resolve the missing input.",
          "Use filters to focus on one institution, cohort, or risk type at a time.",
          "Revisit the tracker after changes to confirm the learner dropped out of the queue.",
        ],
      },
    ],
  },
  {
    key: "placements",
    label: "Placements",
    launchPath: "/placements",
    catalogSummary: "Create and manage workplace placements, status, and ownership.",
    roles: INSTITUTION_ROLES,
    match: (pathname) => pathname === "/placements",
    steps: (role) => [
      {
        title: "Placement Operations",
        description: "This page manages placement creation, ownership, status, and partner alignment.",
        targetId: role === "SuperAdmin" || role === "RegionalAdmin" ? "placements-table" : "placements-new",
        bullets: [
          "Use it to assign learners to workplaces and keep placement records current.",
          "Review status and supervisors before assuming a placement is operationally ready.",
          "Delegation and ownership tools help prevent stalled placements.",
        ],
      },
      {
        title: "Operational Discipline",
        description: "Keep placement records trustworthy and actionable.",
        targetId: "placements-table",
        bullets: [
          "Check that company, dates, supervisor details, and learner linkages are complete.",
          "Use related attendance, messages, and monitoring workflows after activation.",
          "Treat any missing supervisor or unsigned agreement as an immediate follow-up item.",
        ],
      },
    ],
  },
  {
    key: "attendance-logs",
    label: "Attendance & Hours",
    launchPath: "/attendance-logs",
    catalogSummary: "Review hours, sign-off status, and attendance bottlenecks.",
    roles: ["Admin", "Manager", "Staff", "IndustryPartner"],
    match: (pathname) => pathname === "/attendance-logs",
    steps: () => [
      {
        title: "Attendance & Hours",
        description: "This page records attendance submissions and sign-off progress for active placements.",
        targetId: "attendance-logs-filters",
        bullets: [
          "Use it to monitor due logs, rejected entries, and sign-off bottlenecks.",
          "Attendance quality feeds compliance, operational confidence, and reporting.",
          "Focus on overdue or rejected records first.",
        ],
      },
      {
        title: "Good Workflow",
        description: "Keep attendance moving with minimal rework.",
        targetId: "attendance-logs-table",
        bullets: [
          "Verify learner, period, and hours before submitting changes.",
          "Watch for sign-off status to know whether follow-up belongs to institution or partner.",
          "Resolve rejected records quickly so end-of-cycle reporting stays clean.",
        ],
      },
    ],
  },
  {
    key: "monitoring-visits",
    label: "Monitoring Visits",
    launchPath: "/monitoring-visits",
    catalogSummary: "Track field visits, GPS verification, and supervision cadence.",
    roles: INSTITUTION_ROLES,
    match: (pathname) => pathname === "/monitoring-visits",
    steps: () => [
      {
        title: "Monitoring Visits",
        description: "This workspace tracks field verification and placement supervision activity.",
        targetId: "monitoring-visits-export",
        bullets: [
          "Use it to confirm placements are being supervised and documented properly.",
          "GPS, visit outcomes, and timing all matter for compliance and credibility.",
          "Prioritize active placements that have gone too long without a visit.",
        ],
      },
      {
        title: "Review Focus",
        description: "Aim for evidence, timeliness, and follow-through.",
        targetId: "monitoring-visits-table",
        bullets: [
          "Look for missing GPS verification, overdue visits, or unresolved exceptions.",
          "Use the visit detail to capture what was observed, not just that a visit happened.",
          "Follow through on flagged placements from the dashboard or alerts.",
        ],
      },
    ],
  },
  {
    key: "semester-reports",
    label: "Semester Reports",
    launchPath: "/semester-reports",
    catalogSummary: "Manage term closure reports, submissions, and approvals.",
    roles: INSTITUTION_AND_REGION_ROLES,
    match: (pathname) => pathname === "/semester-reports",
    steps: (role) => [
      {
        title: "Semester Reports",
        description: "This page tracks term closure documents and approval progress across the reporting chain.",
        targetId: role === "SuperAdmin" || role === "RegionalAdmin" ? "semester-reports-table" : "semester-reports-term-selector",
        activateTargetId: role === "SuperAdmin" || role === "RegionalAdmin" ? undefined : "semester-reports-initiate",
        activateMode: role === "SuperAdmin" || role === "RegionalAdmin" ? undefined : "dialog",
        bullets: [
          "Use filters to isolate one institution, semester, academic year, or workflow state.",
          role === "SuperAdmin" || role === "RegionalAdmin"
            ? "Review pending submissions quickly so approval queues do not accumulate."
            : "Generate and submit reports on time to avoid deadline escalations.",
          "Treat this page as the source of truth for report readiness.",
        ],
      },
      {
        title: "Approval Discipline",
        description: "Keep the reporting pipeline moving cleanly.",
        targetId: "semester-reports-table",
        bullets: [
          "Open a report when you need details, refresh metrics, or take an approval action.",
          "Use status and deadline cues to focus on the riskiest items first.",
          "Where reports are rejected, fix the root issue before resubmission.",
        ],
      },
    ],
  },
  {
    key: "semester-report-detail",
    label: "Semester Report Detail",
    roles: INSTITUTION_AND_REGION_ROLES,
    match: (pathname) => pathname.startsWith("/semester-reports/"),
    steps: (role) => [
      {
        title: "Report Detail",
        description: "This page is the review and action surface for one semester report.",
        targetId: "semester-report-detail-metrics",
        bullets: [
          "Inspect metrics, narrative, status, and review trail before approving or rejecting.",
          "Use refresh actions when underlying operational data has changed.",
          "Approvals should be based on report completeness and data integrity, not urgency alone.",
        ],
      },
      {
        title: "Decision Quality",
        description: "Use the detail page to leave a clean audit trail.",
        targetId: role === "SuperAdmin" || role === "RegionalAdmin" ? "semester-report-detail-actions" : "semester-report-detail-commentary",
        bullets: [
          "Reject with clear reasons when corrections are required.",
          "Approve only after the numbers and supporting context are credible.",
          "Remember that downstream users rely on these decisions for governance and reporting.",
        ],
      },
      {
        title: "Review Trail",
        description: "Use the review history to understand what decisions were already taken on this report.",
        targetId: "semester-report-detail-review-history",
        includeIfTargetId: "semester-report-detail-review-history",
        bullets: [
          "Check prior reviewer comments before reworking or escalating the report.",
          "Use the history to avoid duplicate decisions and conflicting guidance.",
          "Treat this as the record of governance, not just commentary.",
        ],
      },
    ],
  },
  {
    key: "assessments",
    label: "Assessments",
    launchPath: "/assessments",
    catalogSummary: "Track competency assessment coverage and learner readiness evidence.",
    roles: INSTITUTION_ROLES,
    match: (pathname) => pathname === "/assessments",
    steps: () => [
      {
        title: "Competency Assessments",
        description: "This page manages assessment records tied to learner progression and readiness.",
        bullets: [
          "Use it to monitor completion, evidence quality, and gaps in competency tracking.",
          "Assessment data helps explain learner readiness beyond placement status alone.",
          "Look for missing or stale records that weaken progress visibility.",
        ],
      },
      {
        title: "What Matters",
        description: "Use assessments as evidence, not just administration.",
        bullets: [
          "Confirm the correct learner, date, and assessment result before saving.",
          "Use this page alongside learner profiles for case-level review.",
          "Keep assessment records current so dashboards and risk signals remain trustworthy.",
        ],
      },
    ],
  },
  {
    key: "industry-partners",
    label: "Industry Partners",
    launchPath: "/industry-partners",
    catalogSummary: "Manage partner records, capacity, and operational readiness.",
    roles: INSTITUTION_AND_REGION_ROLES,
    match: (pathname) => pathname === "/industry-partners",
    steps: (role) => [
      {
        title: "Industry Partners",
        description: "This page manages workplace partners, capacity, and partner contact information.",
        targetId: "industry-partners-add",
        bullets: [
          "Search before registering a new company to avoid duplicate partner records.",
          role === "SuperAdmin"
            ? "Approved partners can be edited here and moved into portal-account workflows."
            : "New partner submissions may require HQ approval before they become operational.",
          "Use capacity and status to judge whether a partner can absorb more placements.",
        ],
      },
      {
        title: "Good Practice",
        description: "Treat partner records as operational assets.",
        targetId: "industry-partners-grid",
        bullets: [
          "Keep contact details and slot counts accurate so institutions can plan correctly.",
          "Review approval state before trying to link or activate a partner workflow.",
          "Create portal accounts only for approved, active partners with valid contact emails.",
        ],
      },
    ],
  },
  {
    key: "hq-industry-partners",
    label: "HQ Partner Registry",
    launchPath: "/hq-industry-partners",
    catalogSummary: "HQ approval queue and registry for industry partner onboarding.",
    roles: ["SuperAdmin"],
    match: (pathname, role) => pathname === "/hq-industry-partners" && role === "SuperAdmin",
    steps: () => [
      {
        title: "HQ Partner Registry",
        description: "This page is the approval queue and registry for all industry partners in the platform.",
        bullets: [
          "Review pending submissions before they enter operational partner lists.",
          "Use approval, rejection, and portal actions from one page.",
          "This is the governance checkpoint for partner onboarding quality.",
        ],
      },
      {
        title: "Review Standard",
        description: "Approve carefully and leave clear reasons when needed.",
        bullets: [
          "Check company identity, region, capacity, and contact information before approving.",
          "Rejected records should contain enough comment detail for correction and resubmission.",
          "Portal accounts should only be created after approval and active status are confirmed.",
        ],
      },
    ],
  },
  {
    key: "calendar",
    label: "Calendar",
    launchPath: "/calendar",
    catalogSummary: "Plan around deadlines, milestones, and operational timing.",
    roles: INSTITUTION_ROLES,
    match: (pathname) => pathname === "/calendar",
    steps: () => [
      {
        title: "Operational Calendar",
        description: "This page gives teams visibility into upcoming deadlines and planned academic milestones.",
        bullets: [
          "Use it to anticipate reporting, supervision, and closure workloads.",
          "Treat the calendar as forward planning, not only historical reference.",
          "Pair this with reports and dashboards to stay ahead of deadline risk.",
        ],
      },
      {
        title: "Planning Use",
        description: "Use the calendar to reduce reactive work.",
        bullets: [
          "Check what is due soon before escalating missing submissions.",
          "Align local operational plans with the semester calendar.",
          "Return to this page when reviewing deadline-related alerts on dashboards.",
        ],
      },
    ],
  },
  {
    key: "academic-calendar",
    label: "Academic Calendar",
    launchPath: "/academic-calendar",
    catalogSummary: "Configure HQ-controlled academic terms, date ranges, and events.",
    roles: ["SuperAdmin"],
    match: (pathname, role) => pathname === "/academic-calendar" && role === "SuperAdmin",
    steps: () => [
      {
        title: "Academic Calendar Setup",
        description: "This HQ-only page defines semester windows, deadlines, and important academic events.",
        bullets: [
          "The rest of the platform depends on these dates for risk and closure workflows.",
          "Use clear naming and accurate ranges so downstream users see reliable timing.",
          "Review changes carefully before saving because they affect multiple operational views.",
        ],
      },
      {
        title: "Configuration Discipline",
        description: "Think system-wide when editing this calendar.",
        bullets: [
          "Verify semester and academic year fields before publishing an event.",
          "Use deadline events consistently so report and risk views behave predictably.",
          "Avoid duplicate or ambiguous date records that create conflicting signals.",
        ],
      },
    ],
  },
  {
    key: "users",
    label: "User Management",
    launchPath: "/users",
    catalogSummary: "Govern account lifecycle, access, suspension, and approvals.",
    roles: ADMIN_ROLES,
    match: (pathname) => pathname === "/users",
    steps: () => [
      {
        title: "User Management",
        description: "This page controls account lifecycle, access governance, and workload reassignment.",
        targetId: "users-add",
        bullets: [
          "Create or edit users with the correct scope so access stays defensible.",
          "Use suspension and deactivation carefully when active ownership still exists.",
          "Review approvals, anomalies, and inactive accounts as part of routine governance.",
        ],
      },
      {
        title: "Access Governance",
        description: "Treat this as a control point, not just a directory.",
        targetId: "users-governance",
        bullets: [
          "Use deactivation impact checks before suspending users with live responsibilities.",
          "Resolve risky privileged-account patterns before they become audit issues.",
          "Use approvals and reassignment tools to keep operational ownership clear.",
        ],
      },
    ],
  },
  {
    key: "system-overview",
    label: "System Overview",
    launchPath: "/system-overview",
    catalogSummary: "Review HQ governance, audit, support, and platform-wide risk signals.",
    roles: ["SuperAdmin"],
    match: (pathname, role) => pathname === "/system-overview" && role === "SuperAdmin",
    steps: () => [
      {
        title: "System Overview",
        description: "This HQ dashboard surfaces platform-wide governance, compliance, and execution signals.",
        bullets: [
          "Use it to review audit, data quality, support, school governance, and partner health together.",
          "This page is for high-level control and escalation, not record-level editing.",
          "Open the linked workspaces when a summary card shows abnormal patterns.",
        ],
      },
      {
        title: "How To Read It",
        description: "Move from risk summary to targeted intervention.",
        bullets: [
          "Start with exceptions and overdue items before browsing healthy areas.",
          "Use league tables and governance cards to identify where HQ action is needed.",
          "Treat this page as your daily platform health briefing.",
        ],
      },
    ],
  },
  {
    key: "partner-dashboard",
    label: "Partner Dashboard",
    launchPath: "/partner-dashboard",
    catalogSummary: "Company workspace for supervision, attendance, evaluations, and messages.",
    roles: ["IndustryPartner"],
    match: (pathname, role) => pathname === "/partner-dashboard" && role === "IndustryPartner",
    steps: () => [
      {
        title: "Partner Dashboard",
        description: "This is the company workspace for supervising active placements and partner tasks.",
        targetId: "partner-dashboard-action-queue",
        bullets: [
          "Review assigned placements, action queues, attendance, and evaluations from one place.",
          "Unread messages and overdue actions should be handled first.",
          "Only act on placements assigned to you where required by the workflow.",
        ],
      },
      {
        title: "Partner Workflow",
        description: "Use the dashboard to keep company-side responsibilities current.",
        targetId: "partner-dashboard-placements",
        bullets: [
          "Assign supervisors where missing and keep placement supervision clear.",
          "Submit attendance and employer evaluations on time.",
          "Respond to support items and placement messages without opening duplicate threads.",
        ],
      },
    ],
  },
  {
    key: "guardian-dashboard",
    label: "Guardian Portal",
    launchPath: "/guardian-dashboard",
    catalogSummary: "Guardian-side learner monitoring, consent, alerts, and concerns.",
    roles: ["Guardian"],
    match: (pathname, role) => pathname === "/guardian-dashboard" && role === "Guardian",
    steps: () => [
      {
        title: "Guardian Portal",
        description: "This page helps guardians follow placement progress and communicate concerns.",
        targetId: "guardian-dashboard-learners",
        activateTargetId: "guardian-dashboard-tab-learners",
        bullets: [
          "Use it to monitor linked learners and stay aware of status changes.",
          "The portal is for visibility and communication, not administrative editing.",
          "Where something is wrong, raise a concern instead of creating duplicate records elsewhere.",
        ],
      },
      {
        title: "Best Use",
        description: "Keep communication focused and traceable.",
        targetId: "guardian-dashboard-concerns",
        activateTargetId: "guardian-dashboard-tab-alerts",
        bullets: [
          "Review the learner context before submitting a concern.",
          "Use existing concern threads to continue the same issue.",
          "Return here to monitor follow-up and updated learner progress.",
        ],
      },
      {
        title: "Consent Follow-Up",
        description: "When a learner needs guardian consent, this page surfaces that requirement directly in the learner card.",
        targetId: "guardian-dashboard-consent",
        activateTargetId: "guardian-dashboard-tab-learners",
        activateMode: "tab",
        includeIfTargetId: "guardian-dashboard-consent",
        bullets: [
          "Review the consent block before attempting to sign anything.",
          "If learner date of birth or industry details are missing, the institution must correct that first.",
          "Use the consent flow only for learners who currently require guardian authorization.",
        ],
      },
    ],
  },
  {
    key: "profile",
    label: "Profile",
    launchPath: "/profile",
    catalogSummary: "Review your account details, role, and identity settings.",
    roles: ALL_ROLES,
    match: (pathname) => pathname === "/profile",
    steps: () => [
      {
        title: "Profile",
        description: "This page holds your personal account information and role context.",
        bullets: [
          "Keep your contact details accurate so notifications and admin actions can reach you.",
          "Use this page to confirm your current role and access scope.",
          "Profile accuracy matters for identity, support, and audit traceability.",
        ],
      },
      {
        title: "Maintenance",
        description: "Review your own account the same way you expect others to.",
        bullets: [
          "Update details when your contact or assignment changes.",
          "Use settings for notification preferences and password-related controls.",
          "Escalate role or scope issues rather than working around them.",
        ],
      },
    ],
  },
  {
    key: "notifications",
    label: "Notifications",
    launchPath: "/notifications",
    catalogSummary: "Work through recent alerts and notification history.",
    roles: ALL_ROLES,
    match: (pathname) => pathname === "/notifications",
    steps: () => [
      {
        title: "Notifications",
        description: "This page gives you a full view of recent system alerts and task prompts.",
        targetId: "navbar-notifications",
        bullets: [
          "Use it when the top-bar bell is not enough and you need the broader notification history.",
          "Unread items usually point to work or review paths elsewhere in the app.",
          "Notification quality depends on your settings and role scope.",
        ],
      },
      {
        title: "Working From Alerts",
        description: "Notifications are starting points, not the work itself.",
        bullets: [
          "Open the linked page behind a notification to complete the actual task.",
          "Mark items read as you work so the queue stays meaningful.",
          "Adjust preferences in Settings if signal quality is too noisy or too quiet.",
        ],
      },
    ],
  },
  {
    key: "support-center",
    label: "Help & Support",
    launchPath: "/support-center",
    catalogSummary: "Role guides, FAQs, walkthroughs, and support tickets.",
    roles: ALL_ROLES,
    match: (pathname) => pathname === "/support-center",
    steps: () => [
      {
        title: "Help & Support",
        description: "This page combines guides, FAQs, and support ticket workflows in one place.",
        targetId: "support-new-ticket",
        bullets: [
          "Use the guides first for standard process questions before raising a ticket.",
          "Create a ticket when you need intervention, troubleshooting, or escalation.",
          "The support center is the right place for traceable operational assistance.",
        ],
      },
      {
        title: "Support Hygiene",
        description: "Clear tickets get faster, better responses.",
        targetId: "support-guides-tab",
        bullets: [
          "Choose the closest category and the correct priority.",
          "Describe the issue precisely and include the affected record or workflow.",
          "Continue in the same ticket thread instead of creating duplicates.",
        ],
      },
    ],
  },
  {
    key: "activity-log",
    label: "Activity & Audit Log",
    launchPath: "/activity-log",
    catalogSummary: "Investigate sensitive actions, anomalies, and audit history.",
    roles: ADMIN_ROLES,
    match: (pathname) => pathname === "/activity-log",
    steps: () => [
      {
        title: "Activity & Audit Log",
        description: "This page is the evidence trail for changes, sensitive actions, and platform activity.",
        targetId: "activity-log-filters",
        bullets: [
          "Use filters to isolate the actor, entity, action type, or date window you care about.",
          "The recent events table is your fastest route into the audit detail view.",
          "Exports are useful for formal review, compliance, or incident follow-up.",
        ],
      },
      {
        title: "How To Investigate",
        description: "Work from narrow filters and then inspect the full event payload.",
        targetId: "activity-log-recent-events",
        bullets: [
          "Open event details to compare before and after data where captured.",
          "Use anomaly cards to identify suspicious delete, auth, or mass-update patterns.",
          "Treat this page as the control plane for forensic review, not everyday editing.",
        ],
      },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    launchPath: "/settings",
    catalogSummary: "Adjust notifications, personal preferences, and admin controls.",
    roles: ALL_ROLES,
    match: (pathname) => pathname === "/settings",
    steps: (role) => [
      {
        title: "Settings",
        description: "This page controls platform preferences, notification choices, and certain admin configuration areas.",
        targetId: role === "SuperAdmin" ? "settings-system" : "settings-notifications",
        activateTargetId: role === "SuperAdmin" ? "settings-tab-system" : "settings-tab-notifications",
        bullets: [
          "Use it to adjust how the system communicates with you.",
          "Settings changes can affect workflow visibility and response speed.",
          "Check this page when you are missing alerts or receiving too many.",
        ],
      },
      {
        title: "Recommended Use",
        description: "Set preferences deliberately, not casually.",
        targetId: role === "SuperAdmin" ? "settings-terms" : "settings-notifications",
        activateTargetId: role === "SuperAdmin" ? "settings-tab-terms" : "settings-tab-notifications",
        bullets: [
          "Keep critical notification categories enabled for the workflows you own.",
          "Review settings after role or responsibility changes.",
          "Do not disable important categories if your role depends on timely action.",
        ],
      },
    ],
  },
  {
    key: "offline-sync",
    label: "Offline Sync",
    launchPath: "/offline-sync",
    catalogSummary: "Resolve queued offline actions and sync conflicts.",
    roles: ALL_ROLES,
    match: (pathname) => pathname === "/offline-sync",
    steps: () => [
      {
        title: "Offline Sync",
        description: "This page manages queued actions that were saved while the network was unavailable or unstable.",
        bullets: [
          "Use it to review pending, failed, or conflict-heavy offline actions.",
          "Do not ignore this queue if field teams operate with unreliable connectivity.",
          "The sync history helps explain what was applied and what still needs attention.",
        ],
      },
      {
        title: "Conflict Handling",
        description: "Treat sync review as data protection work.",
        bullets: [
          "Investigate failed or review-required items before clearing them.",
          "Resolve conflicts by comparing server and client intent, not by guessing.",
          "Use this page after reconnecting or after a burst of field updates.",
        ],
      },
    ],
  },
]

function resolveGuide(pathname: string, role?: AppRole) {
  return guideDefinitions.find((guide) => guide.match(pathname, role)) || null
}

export function getGuideCatalog(role?: AppRole): GuideCatalogItem[] {
  return guideDefinitions
    .filter((guide) => guide.launchPath && (!guide.roles || (role ? guide.roles.includes(role) : false)))
    .map((guide) => ({
      key: guide.key,
      label: guide.label,
      launchPath: guide.launchPath!,
      catalogSummary: guide.catalogSummary || guide.label,
      category:
        guide.key === "learners" || guide.key === "learner-progress" || guide.key === "learner-profile"
          ? "Learners"
          : guide.key === "semester-reports" || guide.key === "semester-report-detail" || guide.key === "calendar" || guide.key === "academic-calendar"
            ? "Reporting"
            : guide.key === "users" || guide.key === "system-overview" || guide.key === "activity-log" || guide.key === "hq-industry-partners"
              ? "Governance"
              : guide.key === "industry-partners" || guide.key === "partner-dashboard" || guide.key === "guardian-dashboard"
                ? "Partners"
                : guide.key === "profile" || guide.key === "settings" || guide.key === "notifications" || guide.key === "support-center"
                  ? "Personal"
                  : "Operations",
    }))
}

export function HelpWizard() {
  const location = useLocation()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const activatedSteps = useState(() => new Set<string>())[0]
  const lastPathnameRef = useRef(location.pathname)

  const guide = useMemo(() => resolveGuide(location.pathname, user?.role), [location.pathname, user?.role])
  const steps = useMemo(() => {
    const rawSteps = guide?.steps(user?.role) || []
    return rawSteps.filter((step) => {
      if (!step.includeIfTargetId) return true
      return Boolean(document.querySelector(`[data-help-id="${step.includeIfTargetId}"]`))
    })
  }, [guide, user?.role, location.pathname, open])
  const currentStep = steps[currentStepIndex]

  const persistProgress = (stepIndex: number) => {
    if (!guide?.key || !user?.role) return
    window.localStorage.setItem(buildProgressKey(user.role, guide.key), String(stepIndex))
  }

  const resetProgress = () => {
    if (!guide?.key || !user?.role) return
    window.localStorage.removeItem(buildProgressKey(user.role, guide.key))
    setCurrentStepIndex(0)
  }

  useEffect(() => {
    if (!open) {
      activatedSteps.clear()
    }
  }, [open, activatedSteps])

  useEffect(() => {
    if (lastPathnameRef.current === location.pathname) return
    lastPathnameRef.current = location.pathname
    const timer = window.setTimeout(() => {
      setOpen(false)
      setTargetRect(null)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [location.pathname])

  useEffect(() => {
    if (!open || !currentStep?.targetId) {
      setTargetRect(null)
      return
    }

    if (currentStep.activateTargetId) {
      const activator = document.querySelector<HTMLElement>(`[data-help-id="${currentStep.activateTargetId}"]`)
      const activationKey = `${guide?.key}:${currentStepIndex}:${currentStep.activateTargetId}`
      const target = document.querySelector<HTMLElement>(`[data-help-id="${currentStep.targetId}"]`)

      if (currentStep.activateMode === "dialog") {
        if (!target && activator && !activatedSteps.has(activationKey)) {
          activator.click()
          activatedSteps.add(activationKey)
        }
      } else if (activator?.getAttribute("aria-selected") !== "true") {
        activator?.click()
      }
    }

    const updateTargetRect = () => {
      const target = document.querySelector<HTMLElement>(`[data-help-id="${currentStep.targetId}"]`)
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" })
      }
      setTargetRect(target ? target.getBoundingClientRect() : null)
    }

    const rafId = window.requestAnimationFrame(() => {
      updateTargetRect()
      window.setTimeout(updateTargetRect, 120)
    })
    window.addEventListener("resize", updateTargetRect)
    window.addEventListener("scroll", updateTargetRect, true)

    return () => {
      window.cancelAnimationFrame(rafId)
      window.removeEventListener("resize", updateTargetRect)
      window.removeEventListener("scroll", updateTargetRect, true)
    }
  }, [open, currentStep?.targetId, currentStep?.activateTargetId, currentStep?.activateMode, currentStepIndex, guide?.key, location.pathname, activatedSteps])

  useEffect(() => {
    if (!guide?.key || !user?.role) {
      setCurrentStepIndex(0)
      return
    }

    const storedIndex = Number(window.localStorage.getItem(buildProgressKey(user.role, guide.key)) || "0")
    const nextIndex = Number.isFinite(storedIndex) ? Math.max(0, Math.min(storedIndex, Math.max(steps.length - 1, 0))) : 0
    setCurrentStepIndex(nextIndex)
  }, [guide?.key, location.pathname, user?.role, steps.length])

  useEffect(() => {
    if (!guide || !user?._id) return
    const autoStartKey = buildAutoStartKey(user._id)
    if (window.localStorage.getItem(autoStartKey) === "seen") return

    const timer = window.setTimeout(() => {
      setOpen(true)
      window.localStorage.setItem(autoStartKey, "seen")
    }, 500)

    return () => window.clearTimeout(timer)
  }, [guide, user?._id])

  useEffect(() => {
    if (!guide) return

    const params = new URLSearchParams(location.search)
    if (params.get("help") !== "1" || params.get("guide") !== guide.key) return

    if (params.get("restart") === "1") {
      resetProgress()
    }

    setOpen(true)

    params.delete("help")
    params.delete("guide")
    params.delete("restart")

    const nextSearch = params.toString()
    const nextUrl = `${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash || ""}`
    window.history.replaceState({}, "", nextUrl)
  }, [guide?.key, location.pathname, location.search, location.hash])

  useEffect(() => {
    if (!open) return
    persistProgress(currentStepIndex)
  }, [open, currentStepIndex])

  if (!guide || !steps.length || !currentStep) return null

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-10 w-10 md:h-12 md:w-12 rounded-2xl bg-gray-50 text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-all"
        onClick={() => {
          setOpen(true)
        }}
        title={`Help: ${guide.label}`}
      >
        <CircleHelp className="h-5 w-5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        {open && targetRect ? (
          <div
            className="fixed pointer-events-none rounded-[1.75rem] border-2 border-[#FFB800] shadow-[0_0_0_9999px_rgba(17,24,39,0.6),0_0_0_6px_rgba(251,191,36,0.15)] z-[55] transition-all duration-200"
            style={{
              top: Math.max(targetRect.top - 8, 8),
              left: Math.max(targetRect.left - 8, 8),
              width: targetRect.width + 16,
              height: targetRect.height + 16,
            }}
          />
        ) : null}
        <DialogContent className="max-w-2xl bg-[#111827]/95 border-white/10 text-white">
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-[#FFB800] text-gray-900 border-0 font-black">{guide.label}</Badge>
              <Badge className="bg-white/10 text-white border-white/10">{currentStepIndex + 1} / {steps.length}</Badge>
              {currentStep.targetId && targetRect ? (
                <Badge className="bg-emerald-500/15 text-emerald-200 border-emerald-400/20">Element highlighted</Badge>
              ) : null}
            </div>
            <DialogTitle className="flex items-center gap-3">
              <Sparkles className="h-6 w-6 text-[#FFB800]" />
              {currentStep.title}
            </DialogTitle>
            <DialogDescription className="text-white/70 text-base">
              {currentStep.description}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-[2rem] bg-white/5 border border-white/10 p-5">
            <div className="flex items-center gap-2 mb-4">
              <BookOpenText className="h-5 w-5 text-[#FFB800]" />
              <p className="font-black text-white">What To Know</p>
            </div>
            <ul className="space-y-3">
              {currentStep.bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-3 text-sm text-white/80">
                  <span className="mt-1 h-2 w-2 rounded-full bg-[#FFB800] shrink-0" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="rounded-2xl border-white/15 bg-white/5 text-white hover:bg-white/10"
                onClick={resetProgress}
              >
                Restart Guide
              </Button>
              <Button
                variant="outline"
                className="rounded-2xl border-white/15 bg-white/5 text-white hover:bg-white/10"
                onClick={() => setOpen(false)}
              >
                Close Guide
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="rounded-2xl border-white/15 bg-white/5 text-white hover:bg-white/10"
                onClick={() => {
                  const nextIndex = Math.max(0, currentStepIndex - 1)
                  setCurrentStepIndex(nextIndex)
                  persistProgress(nextIndex)
                }}
                disabled={currentStepIndex === 0}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              {currentStepIndex < steps.length - 1 ? (
                <Button
                  className="rounded-2xl bg-[#FFB800] hover:bg-[#e5a600] text-gray-900"
                  onClick={() => {
                    const nextIndex = Math.min(steps.length - 1, currentStepIndex + 1)
                    setCurrentStepIndex(nextIndex)
                    persistProgress(nextIndex)
                  }}
                >
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  className="rounded-2xl bg-[#FFB800] hover:bg-[#e5a600] text-gray-900"
                  onClick={() => {
                    resetProgress()
                    setOpen(false)
                  }}
                >
                  Finish
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
