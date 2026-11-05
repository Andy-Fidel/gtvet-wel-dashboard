import { useState, type ReactNode } from 'react'
import { ArrowRight, ArrowUpRight, Building2, ChevronLeft, ChevronRight, ShieldAlert, Users } from 'lucide-react'
import { userRoleLabel } from '@/lib/user-directory'
import './user-governance-cards.css'

export interface UserGovernanceData {
  inactiveUsers: number
  pendingPasswordResets: number
  institutionsWithoutActiveAdmins: { _id: string; name: string; region: string; code: string }[]
  privilegedUserAnomalies: { institution: string; adminCount: number; managerCount: number; privilegedCount: number; activePrivilegedCount: number; reasons: string[] }[]
  roleBreakdown: { role: string; count: number }[]
}
const number = new Intl.NumberFormat('en-GH')
const orphanedPath = '/users?governance=orphaned-institutions&role=Admin&status=Active'
const anomaliesPath = '/users?governance=privileged-anomalies'
function ReviewLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button type="button" className="governance-link" onClick={onClick}>{children}<ArrowRight size={16} aria-hidden="true" /></button>
}
function ListPager({ page, pageSize, total, name, onPage }: { page: number; pageSize: number; total: number; name: string; onPage: (page: number) => void }) {
  return <div className="governance-pager">
    <p role="status">Showing {total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} of {number.format(total)} institutions</p>
    <div role="group" aria-label={`${name} pages`}>
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={`Previous ${name.toLowerCase()} page`}><ChevronLeft size={16} aria-hidden="true" /></button>
      <button type="button" disabled={page * pageSize >= total} onClick={() => onPage(page + 1)} aria-label={`Next ${name.toLowerCase()} page`}><ChevronRight size={16} aria-hidden="true" /></button>
    </div>
  </div>
}
export function UserGovernanceCards({ governance, canManageUsers, onOpen }: { governance?: UserGovernanceData; canManageUsers: boolean; onOpen: (path: string) => void }) {
  const [requestedCoveragePage, setCoveragePage] = useState(1)
  const [requestedAnomalyPage, setAnomalyPage] = useState(1)
  const roles = [...(governance?.roleBreakdown || [])].sort((a, b) => b.count - a.count || a.role.localeCompare(b.role))
  const totalAccounts = roles.reduce((sum, role) => sum + role.count, 0)
  const institutions = governance?.institutionsWithoutActiveAdmins || []
  const anomalies = governance?.privilegedUserAnomalies || []
  const coveragePage = Math.min(requestedCoveragePage, Math.max(1, Math.ceil(institutions.length / 3)))
  const anomalyPage = Math.min(requestedAnomalyPage, Math.max(1, Math.ceil(anomalies.length / 2)))
  const institutionPath = (path: string, institution: string) => `${path}&${new URLSearchParams({ institution })}`
  return <div className="governance-cards">
    <section className="governance-detail-card" aria-labelledby="governance-roles-title">
      <header><h3 id="governance-roles-title"><Users size={18} aria-hidden="true" />Users by Role</h3>{canManageUsers ? <button type="button" className="governance-icon-action" aria-label="Open user management" onClick={() => onOpen('/users')}><ArrowUpRight size={18} aria-hidden="true" /></button> : null}</header>
      {roles.length ? <>
        <div className="governance-role-total"><strong>{number.format(totalAccounts)}</strong><p>accounts<span>Across {roles.length} assigned {roles.length === 1 ? 'role' : 'roles'}</span></p></div>
        <ul className="governance-role-list">{roles.map(({ role, count }) => {
          const share = totalAccounts > 0 ? count / totalAccounts * 100 : 0
          const percentage = share > 0 && share < 1 ? '<1%' : `${Math.round(share)}%`
          return <li key={role}><div className="governance-role-label"><span>{userRoleLabel(role)}</span><span className="governance-role-count">{number.format(count)}<span>{percentage}</span></span></div><div className="governance-role-track" aria-hidden="true"><div style={{ width: `${share}%` }} /></div></li>
        })}</ul>
      </> : <p className="governance-empty">No user data available.</p>}
      <footer>{canManageUsers ? <ReviewLink onClick={() => onOpen('/users')}>Manage users</ReviewLink> : <span>Account distribution</span>}<span>All account statuses</span></footer>
    </section>
    <section className="governance-detail-card governance-coverage" aria-labelledby="governance-coverage-title">
      <header><h3 id="governance-coverage-title"><Building2 size={18} aria-hidden="true" />Institutions Without Active Admins</h3><span className="governance-count">{number.format(institutions.length)}</span></header>
      <p className="governance-description">Restore administrator coverage so each institution has someone accountable.</p>
      {institutions.length ? <>
        <div className="governance-signal"><strong>Coverage gap</strong><span>No active administrator</span></div>
        <ul className="governance-exception-list">{institutions.slice((coveragePage - 1) * 3, coveragePage * 3).map(institution => <li key={institution._id}>
          <h4>{institution.name}</h4><p className="governance-record-meta">{[institution.region, institution.code].filter(Boolean).join(' · ') || 'Region and code not recorded'}</p>
          {canManageUsers ? <button type="button" className="governance-record-action" aria-label={`Review administrator coverage for ${institution.name}`} onClick={() => onOpen(institutionPath(orphanedPath, institution.name))}>Review institution<ArrowUpRight size={14} aria-hidden="true" /></button> : null}
        </li>)}</ul>
        <ListPager page={coveragePage} pageSize={3} total={institutions.length} name="Administrator coverage" onPage={setCoveragePage} />
      </> : <p className="governance-empty">Every institution currently has an active admin.</p>}
      <footer>{canManageUsers && institutions.length ? <ReviewLink onClick={() => onOpen(orphanedPath)}>Review all {number.format(institutions.length)} institutions</ReviewLink> : <span>{institutions.length ? 'Contact your user governance administrator' : 'No coverage gaps identified'}</span>}</footer>
    </section>
    <section className="governance-detail-card governance-anomalies" aria-labelledby="governance-anomalies-title">
      <header><h3 id="governance-anomalies-title"><ShieldAlert size={18} aria-hidden="true" />Privileged Access Anomalies</h3><span className="governance-count">{number.format(anomalies.length)}</span></header>
      <p className="governance-description">Check flagged assignments and confirm whether privileged access is appropriate.</p>
      {anomalies.length ? <>
        <div className="governance-signal"><strong>Needs review</strong><span>Flags are signals, not confirmed issues</span></div>
        <ul className="governance-exception-list">{anomalies.slice((anomalyPage - 1) * 2, anomalyPage * 2).map(entry => <li key={entry.institution}>
          <h4>{entry.institution}</h4><p className="governance-record-meta"><span>{number.format(entry.activePrivilegedCount)} active privileged users</span> · {number.format(entry.adminCount)} admins · {number.format(entry.managerCount)} managers</p>
          <ul className="governance-reasons" aria-label={`Access flags for ${entry.institution}`}>{entry.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
          {canManageUsers ? <button type="button" className="governance-record-action" aria-label={`Review privileged access for ${entry.institution}`} onClick={() => onOpen(institutionPath(anomaliesPath, entry.institution))}>Review access<ArrowUpRight size={14} aria-hidden="true" /></button> : null}
        </li>)}</ul>
        <ListPager page={anomalyPage} pageSize={2} total={anomalies.length} name="Access anomalies" onPage={setAnomalyPage} />
      </> : <p className="governance-empty">No privileged-access anomalies detected.</p>}
      <footer>{canManageUsers && anomalies.length ? <ReviewLink onClick={() => onOpen(anomaliesPath)}>Review all {number.format(anomalies.length)} {anomalies.length === 1 ? 'anomaly' : 'anomalies'}</ReviewLink> : <span>{anomalies.length ? 'Contact your user governance administrator' : 'No access flags identified'}</span>}</footer>
    </section>
  </div>
}
