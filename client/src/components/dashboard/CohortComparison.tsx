import { Link } from 'react-router-dom'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { exportCohortCsv } from '@/lib/cohortCsv'
import { MISSING_INTAKE, intakeLabel } from '@/lib/cohorts'

export interface CohortRow {
  intakeAcademicYear: string
  totalLearners: number
  currentEnrolled: number
  graduated: number
  needAttentionCount?: number
  atRiskCount?: number
}

export function CohortComparison({ cohorts, scopeLabel, filterParams = {} }: { cohorts: CohortRow[]; scopeLabel?: string; filterParams?: Record<string, string> }) {
  const attentionCount = (cohort: CohortRow) => cohort.needAttentionCount ?? cohort.atRiskCount ?? 0
  const href = (cohort: CohortRow, attention = false) => {
    const params = new URLSearchParams({ intakeAcademicYear: cohort.intakeAcademicYear || MISSING_INTAKE })
    Object.entries(filterParams).forEach(([key, value]) => { if (value) params.set(key, value) })
    if (attention) params.set('risk', 'at-risk')
    return `${attention ? '/learner-progress' : '/learners'}?${params}`
  }
  const actions = (cohort: CohortRow) => <Link to={href(cohort)} className="font-bold text-indigo-700 underline underline-offset-4">{cohort.intakeAcademicYear === MISSING_INTAKE ? 'Review records' : 'View learners'}</Link>
  const attention = (cohort: CohortRow) => attentionCount(cohort) > 0
    ? <Link to={href(cohort, true)} aria-label={`View ${attentionCount(cohort)} learners needing attention for ${intakeLabel(cohort.intakeAcademicYear)}`} className="font-black text-amber-800 underline underline-offset-4">{attentionCount(cohort)}</Link>
    : <span className="text-gray-600">0</span>
  return <Card className="rounded-2xl border-gray-100 bg-white shadow-lg">
    <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <CardTitle>Cohort Comparison</CardTitle>
        <CardDescription className="mt-2">{scopeLabel ? `${scopeLabel}. ` : ''}Compare intake years and open learners who need follow-up.</CardDescription>
      </div>
      <Button variant="outline" disabled={!cohorts.length} onClick={() => exportCohortCsv([
        ['Intake year', 'Learners', 'Currently enrolled', 'Graduated', 'Need attention'],
        ...cohorts.map(cohort => [intakeLabel(cohort.intakeAcademicYear), cohort.totalLearners, cohort.currentEnrolled, cohort.graduated, attentionCount(cohort)]),
      ])}><Download /> Export</Button>
    </CardHeader>
    <CardContent>
      <p className="mb-2 text-sm text-gray-600">Currently enrolled includes graduating learners. Select an attention count to see follow-up reasons.</p>
      <details className="mb-4 text-sm text-gray-600">
        <summary className="cursor-pointer font-semibold">How attention is counted</summary>
        <p className="mt-2">Each learner is counted once for missing intake information, dropout, average assessment below 50%, negative employer feedback, or overdue monitoring.</p>
      </details>
      {cohorts.length ? <>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm" aria-label="Intake cohort comparison">
            <thead><tr>{['Intake year', 'Learners', 'Currently enrolled', 'Graduated', 'Need attention', 'Action'].map(label => <th key={label} scope="col" className="border-b px-3 py-3 font-bold text-gray-600">{label}</th>)}</tr></thead>
            <tbody>{cohorts.map(cohort => <tr key={cohort.intakeAcademicYear} className="border-b last:border-0">
              <th scope="row" className="px-3 py-4">{intakeLabel(cohort.intakeAcademicYear)}</th>
              <td className="px-3 py-4">{cohort.totalLearners}</td><td className="px-3 py-4">{cohort.currentEnrolled}</td><td className="px-3 py-4">{cohort.graduated}</td>
              <td className="px-3 py-4">{attention(cohort)}</td><td className="px-3 py-4">{actions(cohort)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="space-y-3 md:hidden">{cohorts.map(cohort => <article key={cohort.intakeAcademicYear} className="rounded-xl border p-4" aria-label={`Intake ${intakeLabel(cohort.intakeAcademicYear)}`}>
          <h3 className="font-black">{intakeLabel(cohort.intakeAcademicYear)}</h3>
          <dl className="my-4 grid grid-cols-2 gap-3 text-sm">{[
            ['Learners', cohort.totalLearners], ['Currently enrolled', cohort.currentEnrolled], ['Graduated', cohort.graduated], ['Need attention', attention(cohort)],
          ].map(([label, value]) => <div key={String(label)}><dt className="text-gray-600">{label}</dt><dd className="mt-1 font-bold">{value}</dd></div>)}</dl>
          {actions(cohort)}
        </article>)}</div>
      </> : <p className="rounded-xl bg-gray-50 p-4 text-gray-600">No learner cohorts in this view.</p>}
    </CardContent>
  </Card>
}
