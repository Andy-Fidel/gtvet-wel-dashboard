import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { API_BASE } from '@/config';
import { Lock, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { PasswordRecoveryLayout, recoveryButtonClassName, recoveryInputClassName } from '@/components/auth/PasswordRecoveryLayout';
import { toast } from '@/lib/toast';
import { ensureCsrfToken } from '@/lib/csrf';

export default function ResetPassword() {
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      return toast.error("Passwords do not match");
    }

    if (password.length < 6) {
      return toast.error("Password must be at least 6 characters");
    }

    setIsLoading(true);

    try {
      const csrfToken = await ensureCsrfToken();
      const response = await fetch(`${API_BASE}/auth/reset-password/${token}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ newPassword: password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Something went wrong');
      }

      setIsSuccess(true);
      toast.success(data.message || 'Password has been reset successfully!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PasswordRecoveryLayout
      title={isSuccess ? 'Password reset' : 'Create a new password'}
      description={isSuccess ? 'Your password has been updated successfully.' : 'Choose a new password to secure your institution portal.'}
    >
      {isSuccess ? (
        <div role="status" className="text-center space-y-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFB800]/15 text-[#FFB800]">
            <CheckCircle2 aria-hidden="true" className="h-7 w-7" />
          </div>
          <p className="text-sm text-white/70 leading-relaxed">You can now sign in with your new password.</p>
          <button type="button" onClick={() => navigate('/login')} className={recoveryButtonClassName}>Sign in</button>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit} aria-busy={isLoading}>
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium text-white/80">New password</label>
            <div className="relative">
              <Lock aria-hidden="true" className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                aria-describedby="password-help"
                required
                minLength={6}
                disabled={isLoading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${recoveryInputClassName} pr-14`}
                placeholder="Enter new password"
              />
              <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide new password' : 'Show new password'} aria-pressed={showPassword} className="absolute right-2 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-xl text-white/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB800]">
                {showPassword ? <EyeOff aria-hidden="true" className="h-5 w-5" /> : <Eye aria-hidden="true" className="h-5 w-5" />}
              </button>
            </div>
            <p id="password-help" className="text-xs text-white/60">Use at least 6 characters.</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-white/80">Confirm password</label>
            <div className="relative">
              <Lock aria-hidden="true" className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={6}
                disabled={isLoading}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`${recoveryInputClassName} pr-14`}
                placeholder="Confirm new password"
              />
              <button type="button" onClick={() => setShowConfirmPassword((current) => !current)} aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'} aria-pressed={showConfirmPassword} className="absolute right-2 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-xl text-white/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB800]">
                {showConfirmPassword ? <EyeOff aria-hidden="true" className="h-5 w-5" /> : <Eye aria-hidden="true" className="h-5 w-5" />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={isLoading || !password || !confirmPassword} className={recoveryButtonClassName}>
            {isLoading && <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />}
            {isLoading ? 'Resetting password…' : 'Reset password'}
          </button>
        </form>
      )}
    </PasswordRecoveryLayout>
  );
}
