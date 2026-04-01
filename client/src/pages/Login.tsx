import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Loader2, Mail, Lock } from 'lucide-react';
import gtvetsLogo from '@/assets/gtvets_logo.png';
import workplaceBg from '@/assets/Workplace.webp';

export default function Login() {
  const { login, changePassword } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState<'login' | 'change-password'>('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);
      if (result.passwordChangeRequired) {
        setStep('change-password');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setError('');
    setLoading(true);

    try {
      await changePassword(newPassword);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${workplaceBg})` }} />
      <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm" />
      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg mb-4">
            <img src={gtvetsLogo} alt="GTVETS Logo" className="w-16 h-16 object-contain" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tighter uppercase">GTVETS</h1>
          <span className="text-xs font-bold text-[#FFB800] tracking-[0.3em] uppercase mt-1">WEL Tracker</span>
        </div>

        {/* Login Card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-10 shadow-2xl">
          {step === 'login' ? (
            <>
              <h2 className="text-2xl font-black text-white text-center mb-2">Welcome Back</h2>
              <p className="text-white/40 text-center text-sm mb-8">Sign in to your institution portal</p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-black text-white text-center mb-2">Change Password</h2>
              <p className="text-[#FFB800] text-center text-sm mb-8 font-bold">You must update your temporary password to continue.</p>
            </>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold rounded-2xl px-5 py-3 mb-6 text-center">
              {error}
            </div>
          )}

          {step === 'login' ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="relative">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-white/30" />
                <input
                  type="email"
                  placeholder="Email Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full h-14 pl-14 pr-5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:border-[#FFB800]/50 focus:ring-2 focus:ring-[#FFB800]/20 transition-all cursor-text"
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-white/30" />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full h-14 pl-14 pr-5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:border-[#FFB800]/50 focus:ring-2 focus:ring-[#FFB800]/20 transition-all cursor-text"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-[#FFB800] hover:bg-[#FFD700] text-gray-900 font-black rounded-2xl shadow-xl shadow-[#FFB800]/20 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="h-5 w-5 animate-spin" />}
                Sign In
              </button>
              
              <div className="text-center mt-3">
                <button
                  type="button"
                  onClick={() => navigate('/forgot-password')}
                  className="text-white/60 text-sm font-medium hover:text-white transition-colors"
                >
                  Forgot your password?
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-5">
              <div className="relative">
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-white/30" />
                <input
                  type="password"
                  placeholder="New Password (min 6 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full h-14 pl-14 pr-5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:border-[#FFB800]/50 focus:ring-2 focus:ring-[#FFB800]/20 transition-all cursor-text"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-[#FFB800] hover:bg-[#FFD700] text-gray-900 font-black rounded-2xl shadow-xl shadow-[#FFB800]/20 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="h-5 w-5 animate-spin" />}
                Update Password & Continue
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
