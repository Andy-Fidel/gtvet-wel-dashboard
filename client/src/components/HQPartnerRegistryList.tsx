import { useRef } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { approvalLabels, partnerTypeLabels, locationLabel, partnerAttention, portalLabels } from '@/lib/hqPartnerRegistry'
import type { HQPartnerRecord } from './HQPartnerDetailsDialog'

type Props = {
  partners: HQPartnerRecord[]
  disabled: boolean
  canManage: boolean
  canApprove: boolean
  pending: Record<string, boolean>
  onDetails: (partner: HQPartnerRecord, trigger: HTMLElement) => void
  onAllocation: (partner: HQPartnerRecord) => void
  onEdit: (partner: HQPartnerRecord) => void
  onDecision: (partner: HQPartnerRecord, type: 'approve' | 'reject') => void
  onCreateAccount: (partner: HQPartnerRecord) => void
  onManageAccounts: () => void
}
function Actions({ partner, props }: { partner: HQPartnerRecord; props: Props }) {
  const trigger = useRef<HTMLButtonElement>(null)
  const eligible = (!partner.approvalStatus || partner.approvalStatus === 'Approved') && partner.status === 'Active'
  const createAllowed = eligible && Boolean(partner.contactEmail) && partner.portalAccount?.state === 'NotCreated'
  return <DropdownMenu><DropdownMenuTrigger asChild><Button ref={trigger} variant="ghost" className="h-11 w-11 shrink-0 p-0" aria-label={`Actions for ${partner.name}`} disabled={props.disabled || props.pending[partner._id]}><MoreHorizontal aria-hidden="true" className="h-4 w-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)] rounded-xl bg-white motion-reduce:animate-none">
      <DropdownMenuItem onSelect={() => { if (trigger.current) props.onDetails(partner, trigger.current) }}>View details</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => props.onAllocation(partner)}>Reserved slots</DropdownMenuItem>
      {props.canManage && <DropdownMenuItem onSelect={() => props.onEdit(partner)}>Edit partner / location</DropdownMenuItem>}
      {props.canApprove && partner.approvalStatus === 'PendingHQApproval' && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => props.onDecision(partner, 'approve')}>Approve</DropdownMenuItem><DropdownMenuItem onSelect={() => props.onDecision(partner, 'reject')}>Reject</DropdownMenuItem></>}
      {props.canManage && <><DropdownMenuSeparator /><DropdownMenuItem disabled={!createAllowed} onSelect={() => props.onCreateAccount(partner)}>Create coordinator account</DropdownMenuItem><DropdownMenuItem onSelect={props.onManageAccounts}>Manage partner accounts</DropdownMenuItem></>}
    </DropdownMenuContent>
  </DropdownMenu>
}
function State({ partner }: { partner: HQPartnerRecord }) {
  const approval = partner.approvalStatus || 'Approved'
  return <div className="space-y-1.5"><Badge className={approval === 'PendingHQApproval' ? 'border-amber-200 bg-amber-50 text-amber-800' : approval === 'Rejected' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}>{approvalLabels[approval]}</Badge><p className="text-xs text-gray-600">{partner.status === 'Active' ? 'Operational status: Active' : 'Operational status: Inactive'}</p></div>
}
function Evidence({ partner, pending }: { partner: HQPartnerRecord; pending: boolean }) {
  const reasons = partnerAttention(partner)
  return <div className="space-y-1 text-xs text-gray-600">
    <p>{locationLabel(partner)}</p><p>{partner.totalSlots ?? 0} reported slots · {partner.usedSlots ?? 0} recorded used</p>
    <p className={reasons.length ? 'text-amber-800' : 'text-gray-500'}>{reasons.length ? `${reasons.length} items to review in details` : 'Review dates and reservations before placement'}</p>
    <p>{partner.portalAccount ? portalLabels[partner.portalAccount.state] : 'Portal account status unavailable'}</p>
    {pending && <p role="status" className="font-medium text-amber-800">Creating coordinator account…</p>}
  </div>
}
export function HQPartnerRegistryList(props: Props) {
  return <>
    <div className="hidden overflow-hidden rounded-xl border border-gray-200 xl:block"><Table><TableHeader><TableRow><TableHead>Partner</TableHead><TableHead>Sector / region</TableHead><TableHead>Approval / operation</TableHead><TableHead>Evidence and capacity</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
      <TableBody>{props.partners.map(partner => <TableRow key={partner._id}>
        <TableCell className="max-w-64"><button type="button" className="text-left font-semibold text-gray-900 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2" onClick={event => props.onDetails(partner, event.currentTarget)}>{partner.name}</button><p className="mt-1 text-xs text-gray-500">{partnerTypeLabels[partner.partnerType || 'RegisteredCompany']}</p><p className="mt-1 break-all text-xs text-gray-500">{partner.contactEmail || 'No contact email'}</p></TableCell>
        <TableCell><p className="text-sm text-gray-700">{partner.sector}</p><p className="mt-1 text-xs text-gray-500">{partner.region}{partner.district ? ` · ${partner.district}` : ''}</p></TableCell>
        <TableCell><State partner={partner} /></TableCell><TableCell><Evidence partner={partner} pending={props.pending[partner._id]} /></TableCell><TableCell><Actions partner={partner} props={props} /></TableCell>
      </TableRow>)}</TableBody></Table></div>
    <div className="space-y-3 xl:hidden">{props.partners.map(partner => <article key={partner._id} className="space-y-3 rounded-xl border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><button type="button" className="break-words text-left font-semibold text-gray-900 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2" onClick={event => props.onDetails(partner, event.currentTarget)}>{partner.name}</button><p className="mt-1 text-xs text-gray-500">{partnerTypeLabels[partner.partnerType || 'RegisteredCompany']} · {partner.sector}</p><p className="mt-1 text-xs text-gray-500">{partner.region}</p></div><Actions partner={partner} props={props} /></div>
      <State partner={partner} /><Evidence partner={partner} pending={props.pending[partner._id]} />
    </article>)}</div>
  </>
}
