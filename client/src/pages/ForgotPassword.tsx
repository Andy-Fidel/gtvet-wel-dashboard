import { useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE } from '@/config';
import { Loader2, Mail } from 'lucide-react';
import { PasswordRecoveryLayout, recoveryButtonClassName, recoveryInputClassName } from '@/components/auth/PasswordRecoveryLayout';
import { toast } from '@/lib/toast';
import { ensureCsrfToken } from '@/lib/csrf';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const csrfToken = await ensureCsrfToken();
      const response = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Something went wrong');
      }

      setIsSent(true);
      toast.success(data.message || 'Reset link sent!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send reset link');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PasswordRecoveryLayout
      title={isSent ? 'Check your email' : 'Reset your password'}
      description={isSent ? 'Follow the link in your email to create a new password.' : "Enter your registered email address and we’ll send you a password reset link."}
    >
      {isSent ? (
        <div role="status" className="text-center space-y-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFB800]/15 text-[#FFB800]">
            <Mail aria-hidden="true" className="h-7 w-7" />
          </div>
          <p className="text-sm text-white/70 leading-relaxed break-words">
            If an account exists for <span className="font-bold text-white">{email}</span>, we have sent a password reset link. Check your spam folder too.
          </p>
          <Link to="/login" className={recoveryButtonClassName}>Return to sign in</Link>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit} aria-busy={isLoading}>
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-white/80">Email address</label>
            <div className="relative">
              <Mail aria-hidden="true" className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={isLoading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${recoveryInputClassName} pr-5`}
                placeholder="Enter your email address"
              />
            </div>
          </div>
          <button type="submit" disabled={isLoading || !email.trim()} className={recoveryButtonClassName}>
            {isLoading && <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />}
            {isLoading ? 'Sending link…' : 'Send reset link'}
          </button>
        </form>
      )}
    </PasswordRecoveryLayout>
  );
}
