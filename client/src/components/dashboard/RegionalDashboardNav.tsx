import { BarChart3, Building2, ClipboardList, Users } from "lucide-react";

export type RegionalDashboardWorkspace = "operations" | "institutions" | "learners" | "insights";

interface RegionalDashboardNavProps {
  value: RegionalDashboardWorkspace;
  onChange: (value: RegionalDashboardWorkspace) => void;
}

const workspaceOptions = [
  { value: "operations", label: "Operations", description: "Approvals, escalations and compliance", icon: ClipboardList },
  { value: "institutions", label: "Institutions", description: "Performance, coverage and governance", icon: Building2 },
  { value: "learners", label: "Learners", description: "Progress, attendance and outcomes", icon: Users },
  { value: "insights", label: "Insights", description: "Trends, pipeline and distributions", icon: BarChart3 },
] as const;

export function RegionalDashboardNav({ value, onChange }: RegionalDashboardNavProps) {
  return (
    <nav data-help-id="regional-workspace-tabs" className="rounded-2xl border border-gray-200 bg-white p-2 shadow-sm" aria-label="Regional dashboard workspaces">
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4" role="tablist" aria-label="Regional dashboard sections">
        {workspaceOptions.map((workspace) => {
          const Icon = workspace.icon;
          const isActive = value === workspace.value;

          return (
            <button
              key={workspace.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-help-id={workspace.value === "operations" ? "regional-workspace-operations" : undefined}
              onClick={() => onChange(workspace.value)}
              className={`min-h-16 rounded-xl px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 md:px-4 ${isActive ? "bg-gray-950 text-white shadow-md" : "text-gray-600 hover:bg-gray-50"}`}
            >
              <span className="flex items-center gap-2 text-sm font-black">
                <Icon className="h-4 w-4" /> {workspace.label}
              </span>
              <span className={`mt-1 hidden text-[11px] font-medium sm:block ${isActive ? "text-gray-300" : "text-gray-400"}`}>{workspace.description}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
