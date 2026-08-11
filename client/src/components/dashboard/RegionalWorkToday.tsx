import { ArrowRight, CheckCircle2, ClipboardList } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type RegionalWorkPriority = "Critical" | "High" | "Medium";

export interface RegionalWorkItem {
  id: string;
  category: "Reports" | "Support" | "Deadlines" | "Data quality" | "Governance";
  priority: RegionalWorkPriority;
  title: string;
  context: string;
  owner: string;
  timing: string;
  nextAction: string;
  target: string;
  score: number;
}

interface RegionalWorkSummary {
  reports: number;
  urgentSupport: number;
  deadlineRisk: number;
  dataIssues: number;
}

interface RegionalWorkTodayProps {
  items: RegionalWorkItem[];
  summary: RegionalWorkSummary;
  onOpen: (target: string) => void;
}

const priorityTone: Record<RegionalWorkPriority, string> = {
  Critical: "border-red-200 bg-red-50 text-red-700",
  High: "border-amber-200 bg-amber-50 text-amber-700",
  Medium: "border-blue-200 bg-blue-50 text-blue-700",
};

const summaryTone = {
  reports: "bg-amber-50 text-amber-800",
  support: "bg-red-50 text-red-800",
  deadlines: "bg-orange-50 text-orange-800",
  data: "bg-indigo-50 text-indigo-800",
};

export function RegionalWorkToday({ items, summary, onOpen }: RegionalWorkTodayProps) {
  const summaryItems = [
    { label: "Reports to review", count: summary.reports, target: "/semester-reports?from=regional-work-today", tone: summaryTone.reports },
    { label: "Urgent support", count: summary.urgentSupport, target: "/support-center?priority=Urgent&from=regional-work-today", tone: summaryTone.support },
    { label: "Deadline risk", count: summary.deadlineRisk, target: "/semester-reports?deadlineView=overdue&from=regional-work-today", tone: summaryTone.deadlines },
    { label: "Data issues", count: summary.dataIssues, target: "#regional-data-quality", tone: summaryTone.data },
  ];

  const openTarget = (target: string) => {
    if (target.startsWith("#")) {
      document.querySelector(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    onOpen(target);
  };

  return (
    <Card id="regional-workspace-operations-panel" role="tabpanel" data-help-id="regional-work-today" className="overflow-hidden rounded-[2rem] border-indigo-100 bg-white shadow-xl">
      <CardHeader className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-amber-50 p-4 md:p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-indigo-600 p-3 text-white shadow-lg shadow-indigo-600/20">
              <ClipboardList className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-2xl font-black text-gray-900">Regional Work Today</CardTitle>
              <CardDescription className="mt-1 text-sm font-bold text-gray-500">One prioritized queue across reports, escalations, deadlines, and data quality.</CardDescription>
            </div>
          </div>
          <Badge className="w-fit border-0 bg-indigo-600 px-3 py-1.5 text-white hover:bg-indigo-600">
            {items.length} priority item{items.length === 1 ? "" : "s"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-4 md:p-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {summaryItems.map((summaryItem) => (
            <button
              key={summaryItem.label}
              type="button"
              onClick={() => openTarget(summaryItem.target)}
              className={`min-h-24 rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${summaryItem.tone}`}
              aria-label={`Open ${summaryItem.label.toLowerCase()}: ${summaryItem.count}`}
            >
              <span className="block text-2xl font-black">{summaryItem.count}</span>
              <span className="mt-1 block text-xs font-black uppercase tracking-wider opacity-75">{summaryItem.label}</span>
            </button>
          ))}
        </div>

        {items.length > 0 ? (
          <div className="space-y-3" aria-label="Prioritized regional work queue">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openTarget(item.target)}
                className="group w-full rounded-2xl border border-gray-100 bg-gray-50 p-4 text-left transition hover:border-indigo-200 hover:bg-indigo-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 md:p-5"
                aria-label={`${item.nextAction}: ${item.title}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={`rounded-full ${priorityTone[item.priority]}`}>{item.priority}</Badge>
                      <span className="text-xs font-black uppercase tracking-wider text-gray-400">{item.category}</span>
                    </div>
                    <p className="mt-2 font-black text-gray-900">{item.title}</p>
                    <p className="mt-1 text-sm font-semibold text-gray-500">{item.context} · {item.timing}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-sm font-black text-indigo-600">
                    {item.nextAction}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
                <p className="mt-3 text-xs font-bold text-gray-500"><span className="text-gray-400">Owner:</span> {item.owner}</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
            <p className="mt-2 font-black text-emerald-900">No priority regional work is waiting.</p>
            <p className="mt-1 text-sm font-semibold text-emerald-700">Continue with the performance review below.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
