import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, CheckCircle2, Clock3, Download, MinusCircle, RefreshCw, Server, WifiOff } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

type HealthStatus = 'healthy' | 'warning' | 'failed' | 'not_configured' | 'not_used'
type ServiceCheck = {
  id: string; label: string; description: string; status: HealthStatus; summary: string
  durationMs: number; details: Array<{ label: string; value: string }>; action: string | null
}
type HealthReport = {
  checkedAt: string; status: 'healthy' | 'warning' | 'failed'; checks: ServiceCheck[]
  deployment: { version: string; commit: string | null; builtAt: string | null; runtime: string; environment: string }
}
const statusStyles = {
  healthy: { label: 'Healthy', className: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircle2 },
  warning: { label: 'Needs attention', className: 'bg-amber-100 text-amber-900 border-amber-200', icon: AlertTriangle },
  failed: { label: 'Check failed', className: 'bg-red-100 text-red-800 border-red-200', icon: AlertTriangle },
  not_configured: { label: 'Not configured', className: 'bg-amber-100 text-amber-900 border-amber-200', icon: AlertTriangle },
  not_used: { label: 'Not used', className: 'bg-slate-100 text-slate-700 border-slate-200', icon: MinusCircle },
}
const timeLabel = (value: string) => new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Africa/Accra' }).format(new Date(value))

function ServiceBadge({ status }: { status: HealthStatus }) {
  const style = statusStyles[status]
  const Icon = style.icon
  return <Badge variant="outline" className={`${style.className} gap-1.5 whitespace-nowrap`}><Icon aria-hidden="true" className="h-3.5 w-3.5" />{style.label}</Badge>
}

export default function SystemHealth() {
  const { authFetch, user } = useAuth()
  const [online, setOnline] = useState(navigator.onLine)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    const timer = window.setInterval(() => setNow(Date.now()), 15000)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); window.clearInterval(timer) }
  }, [])
  const query = useQuery({
    queryKey: ['system-health', user?._id], enabled: online,
    staleTime: 15000, refetchInterval: 60000, retry: false,
    queryFn: async ({ signal }) => {
      const controller = new AbortController()
      const abort = () => controller.abort()
      signal.addEventListener('abort', abort, { once: true })
      const timeout = window.setTimeout(abort, 15000)
      try {
        const response = await authFetch('/api/system-health', { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error(response.status === 403 ? 'Your account does not have access to system health.' : 'The diagnostics API could not be reached. Try again or contact your system administrator.')
        const report = await response.json() as HealthReport
        if (!Number.isFinite(Date.parse(report.checkedAt)) || !report.deployment || !Array.isArray(report.checks) || !report.checks.every(check => check.status in statusStyles)) throw new Error('The diagnostics response could not be read. Try again or contact your system administrator.')
        return report
      } finally { window.clearTimeout(timeout); signal.removeEventListener('abort', abort) }
    },
  })
  const report = query.data
  const stale = !online || query.isError || Boolean(report && now - Date.parse(report.checkedAt) > 120000)
  const attention = report?.checks.filter(check => ['failed', 'warning', 'not_configured'].includes(check.status)).length || 0
  const healthy = report?.checks.filter(check => check.status === 'healthy').length || 0
  const unused = report?.checks.filter(check => check.status === 'not_used').length || 0
  const download = () => {
    if (!report) return
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...report, lastKnownResults: stale }, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = `gtvet-system-health-${report.checkedAt.slice(0, 10)}.json`; link.click()
    URL.revokeObjectURL(url)
  }

  return <div className="mx-auto w-full max-w-6xl space-y-6 pb-10">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-700"><Activity aria-hidden="true" className="h-5 w-5" /> HQ system administration</div>
        <h1 className="text-3xl font-black tracking-tight text-slate-950">System health</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">Post-deployment checks for the services supporting the WEL portal.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!report} onClick={download}><Download aria-hidden="true" className="mr-2 h-4 w-4" />Download report</Button>
        <Button className="bg-[#FFB800] text-slate-950 hover:bg-[#E6A600]" disabled={query.isFetching || !online} onClick={() => void query.refetch()}><RefreshCw aria-hidden="true" className={`mr-2 h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />{query.isFetching ? 'Checking…' : 'Run diagnostics'}</Button>
      </div>
    </header>

    {(stale || query.isError) && <div role="alert" className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
      {online ? <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" /> : <WifiOff aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />}
      <div><p className="font-semibold">Live health could not be confirmed</p><p className="mt-1 text-sm">{!online ? 'You’re offline. Reconnect to run diagnostics.' : query.error instanceof Error ? query.error.message : 'These checks are out of date. Run diagnostics again.'}{report ? ' Results below are last known results, not current confirmation.' : ''}</p></div>
    </div>}

    <Card className="overflow-hidden rounded-3xl">
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-blue-50 p-3 text-blue-700"><Server aria-hidden="true" className="h-6 w-6" /></div>
            <div role="status" aria-live="polite">
              <h2 className="text-lg font-bold text-slate-950">{stale ? 'Awaiting live confirmation' : !report ? 'Checking system services' : report.status === 'healthy' ? 'All active checks passed' : `${attention} ${attention === 1 ? 'check needs' : 'checks need'} attention`}</h2>
              <p className="mt-1 text-sm text-slate-600">{report ? `Last checked ${timeLabel(report.checkedAt)} · Ghana time` : 'Checking connectivity, configuration, and service readiness.'}</p>
              <p className="mt-1 text-xs text-slate-500">Refreshes every minute while this page is open. Checks may be reused for up to 15 seconds.</p>
            </div>
          </div>
          {report && <Badge variant="outline" className="w-fit capitalize">{report.deployment.environment}</Badge>}
        </div>
        {report && <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
          {[['Healthy', healthy], ['Needs attention', attention], ['Not used', unused]].map(([label, count]) => <div key={label} className="min-w-0"><dt className="text-xs font-medium text-slate-600">{stale ? `Last known: ${label}` : label}</dt><dd className="mt-1 text-2xl font-bold text-slate-950">{count}</dd></div>)}
        </dl>}
      </CardContent>
    </Card>

    {!report && query.isPending && online && <div aria-label="Loading service checks" className="grid gap-4 md:grid-cols-2">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-40 rounded-3xl" />)}</div>}
    {report && <section aria-labelledby="service-checks-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 id="service-checks-title" className="text-lg font-bold text-slate-950">Service checks</h2><p className="text-xs text-slate-500">{stale ? 'Last known results' : 'Live diagnostics'} · No test emails or push messages are sent</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        {report.checks.map(check => <Card key={check.id} className="rounded-3xl shadow-sm" aria-labelledby={`health-${check.id}`}>
          <CardHeader className="pb-3"><div className="flex flex-wrap items-start justify-between gap-2"><h3 id={`health-${check.id}`} className="font-bold text-slate-950">{check.label}</h3><ServiceBadge status={check.status} /></div><p className="text-xs text-slate-500">{check.description}</p></CardHeader>
          <CardContent className="space-y-3 px-4 pb-5 md:px-6">
            <p className="text-sm text-slate-700">{check.summary}</p>
            {Boolean(check.details?.length) && <dl className="space-y-2 rounded-xl bg-slate-50 p-3 text-xs">{check.details.map(item => <div key={item.label} className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-slate-600">{item.label}</dt><dd className="min-w-0 break-words font-medium text-slate-900">{item.label.includes('time') || item.label === 'Last successful run' ? Number.isFinite(Date.parse(item.value)) ? timeLabel(item.value) : item.value : item.value}</dd></div>)}</dl>}
            {check.action && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950"><span className="font-semibold">Next step: </span>{check.action}</p>}
            <div className="flex items-center gap-1.5 text-xs text-slate-500"><Clock3 aria-hidden="true" className="h-3.5 w-3.5" />{check.durationMs} ms to check{stale ? ' · Last known' : ''}</div>
          </CardContent>
        </Card>)}
      </div>
    </section>}
    <p className="text-xs leading-relaxed text-slate-500">These checks describe this application instance. They verify service readiness and available delivery history; a healthy result does not guarantee delivery to every inbox or device. Scheduled deployment monitoring remains available in UptimeRobot.</p>
  </div>
}
