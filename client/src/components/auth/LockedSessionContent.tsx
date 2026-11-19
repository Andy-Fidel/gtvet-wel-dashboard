import { useEffect, useRef, useState, type FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, Eye, EyeOff, Info, Loader2, LockKeyhole, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import logo from '@/assets/gtvets_logo.png';
import './session-lock.css';

interface Props {
  email: string;
  password: string;
  onPasswordChange: (value: string) => void;
  mfaCode: string;
  onMfaCodeChange: (value: string) => void;
  needsMfa: boolean;
  busy: boolean;
  error: string;
  onSubmit: (event: FormEvent) => void;
  onSignOut: () => void;
}

export function SessionLockBrand() {
  return <>
    <div className="session-lock-brand" aria-hidden="true">
      <img src={logo} alt="" />
      <div><strong>GTVETS</strong><span>WEL TRACKER</span></div>
    </div>
    <div className="session-lock-footer" aria-hidden="true">Ghana TVET Service <span>·</span> Workplace Experience Learning</div>
  </>;
}

function WorkspaceIllustration() {
  return <div className="session-lock-vector" aria-hidden="true">
    <svg viewBox="0 0 360 260" fill="none">
      <ellipse cx="184" cy="229" rx="130" ry="13" fill="#172b47" />
      <path d="M27 125H84M278 91h48M303 72v39M42 174v20M32 184h20" stroke="#334760" strokeWidth="2" />
      <rect x="72" y="59" width="198" height="144" rx="14" fill="#2b405d" transform="rotate(-8 72 59)" />
      <rect x="86" y="43" width="198" height="158" rx="14" fill="#fff" />
      <path d="M86 77h198" stroke="#cbd5e1" />
      <circle cx="102" cy="60" r="3" fill="#94a3b8" /><circle cx="113" cy="60" r="3" fill="#cbd5e1" />
      <rect x="105" y="94" width="40" height="40" rx="9" fill="#fef3c7" />
      <path d="M116 116l7 7 12-17" stroke="#a16207" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="158" y="99" width="98" height="7" rx="3.5" fill="#475569" />
      <rect x="158" y="115" width="70" height="5" rx="2.5" fill="#cbd5e1" />
      <rect x="105" y="151" width="145" height="5" rx="2.5" fill="#cbd5e1" />
      <rect x="105" y="166" width="110" height="5" rx="2.5" fill="#cbd5e1" />
      <path d="M269 124l44 17v39c0 28-24 45-44 52-20-7-44-24-44-52v-39l44-17Z" fill="#ffb800" stroke="#14243c" strokeWidth="7" />
      <path d="M269 139l29 11v29c0 18-16 31-29 37-13-6-29-19-29-37v-29l29-11Z" stroke="#b77900" strokeWidth="1.5" />
    </svg>
    <LockKeyhole className="session-lock-vector-lock" />
  </div>;
}

export function LockedSessionContent({ email, password, onPasswordChange, mfaCode, onMfaCodeChange, needsMfa, busy, error, onSubmit, onSignOut }: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const passwordInput = useRef<HTMLInputElement>(null);
  const mfaInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    (needsMfa ? mfaInput.current : passwordInput.current)?.focus();
  }, [needsMfa]);

  return <div className="session-lock">
    <div className="session-lock-art" aria-hidden="true">
      <div className="session-lock-tag"><ShieldCheck size={16} />Secure session</div>
      <WorkspaceIllustration />
      <div className="session-lock-art-title">A brief pause.<br />A smooth return.</div>
      <p>Your workspace stays in this tab<br />while you sign back in.</p>
      <div className="session-lock-art-rule" />
    </div>
    <div className="session-lock-body">
      <div className="session-lock-eyebrow"><LockKeyhole size={14} aria-hidden="true" />Session locked</div>
      <Dialog.Title className="session-lock-title">Sign in to continue</Dialog.Title>
      <Dialog.Description className="session-lock-intro">Sign in with the same account to return to your open work.</Dialog.Description>
      <form onSubmit={onSubmit} aria-busy={busy}>
        <div className="session-lock-account">
          <div className="session-lock-user"><UserRound size={19} aria-hidden="true" /></div>
          <div className="session-lock-identity"><span>Signed-in account</span><strong>{email}</strong></div>
          <LockKeyhole size={15} aria-hidden="true" />
        </div>
        {error && <p role="alert" id="resume-error" className="session-lock-error">{error}</p>}
        <label className="session-lock-label" htmlFor="resume-password">Password</label>
        <div className="session-lock-password">
          <LockKeyhole size={18} aria-hidden="true" />
          <input ref={passwordInput} id="resume-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={event => onPasswordChange(event.target.value)} disabled={busy} placeholder="Enter your password" aria-describedby={error ? 'resume-error' : undefined} />
          <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-controls="resume-password" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} disabled={busy}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </div>
        {needsMfa && <div className="session-lock-mfa">
          <label className="session-lock-label" htmlFor="resume-mfa">Authenticator or recovery code</label>
          <input ref={mfaInput} id="resume-mfa" name="mfaCode" autoComplete="one-time-code" required maxLength={64} value={mfaCode} onChange={event => onMfaCodeChange(event.target.value)} disabled={busy} aria-describedby="resume-mfa-hint" />
          <p id="resume-mfa-hint">Enter the code from your authenticator app or a recovery code.</p>
        </div>}
        <button type="submit" disabled={busy} className="session-lock-submit">{busy && <Loader2 size={18} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}{busy ? 'Signing in…' : 'Sign in and resume'}{!busy && <ArrowRight size={18} aria-hidden="true" />}</button>
      </form>
      <div className="session-lock-notice"><Info size={17} aria-hidden="true" /><p>Keep this tab open to retain unsaved entries.</p></div>
      <button type="button" onClick={onSignOut} disabled={busy} className="session-lock-signout"><LogOut size={15} aria-hidden="true" />Sign out</button>
    </div>
  </div>;
}
