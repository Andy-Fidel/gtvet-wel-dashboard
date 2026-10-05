import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const stages = [
  { status: 'Draft', label: 'Draft', colour: 'bg-slate-100 text-slate-700 border-slate-200' },
  { status: 'Certified', label: 'Certified', colour: 'bg-violet-50 text-violet-700 border-violet-200' },
  { status: 'Generated', label: 'Generated', colour: 'bg-gray-100 text-gray-700 border-gray-200' },
  { status: 'Submitted', label: 'Submitted', colour: 'bg-amber-50 text-amber-700 border-amber-200' },
  { status: 'Regional_Approved', label: 'Regional approved', colour: 'bg-blue-50 text-blue-700 border-blue-200' },
  { status: 'HQ_Approved', label: 'HQ approved', colour: 'bg-green-50 text-green-700 border-green-200' },
  { status: 'Rejected', label: 'Rejected', colour: 'bg-red-50 text-red-700 border-red-200' },
] as const

export function ReportApprovalPipeline({ reports }: { reports?: { status: string; count: number }[] }) {
  return <Card className="rounded-[2rem] border-gray-100 bg-white shadow-xl">
    <CardHeader>
      <CardTitle>Report Approval Pipeline</CardTitle>
      <CardDescription>All reporting cycles within your assigned scope. Select a stage to view its reports.</CardDescription>
    </CardHeader>
    <CardContent>
      {reports ? <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stages.map(stage => <Link key={stage.status} to={`/semester-reports?status=${stage.status}`} className={`rounded-2xl border p-4 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 ${stage.colour}`}>
          <span className="block text-2xl font-black">{reports.find(report => report.status === stage.status)?.count ?? 0}</span>
          <span className="text-xs font-bold">{stage.label}</span>
        </Link>)}
      </div> : <p className="text-sm text-gray-600">Report totals are unavailable. Refresh the dashboard to try again.</p>}
    </CardContent>
  </Card>
}
