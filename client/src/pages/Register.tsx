import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Loader2, Mail, Lock, Building2, User, Phone } from 'lucide-react';
import gtvetsLogo from '@/assets/gtvets_logo.png';
import workplaceBg from '@/assets/Workplace.png';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    institution: '',
    phone: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setLoading(true);

    try {
      await register(formData);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
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
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase">GTVETS</h1>
          <span className="text-xs font-bold text-[#FFB800] tracking-[0.3em] uppercase mt-1">WEL Tracker</span>
        </div>

        {/* Register Card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-10 shadow-2xl">
          <h2 className="text-2xl font-black text-white text-center mb-2">Create Account</h2>
          <p className="text-white/40 text-center text-sm mb-8">Register your institution on the platform</p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold rounded-2xl px-5 py-3 mb-6 text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <User className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-white/30" />
              <input
                type="text"
                name="name"
                placeholder="Full Name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full h-14 pl-14 pr-5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:border-[#FFB800]/50 focus:ring-2 focus:ring-[#FFB800]/20 transition-all"
              />
            </div>
            <div className="relative">
              <Mail className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-white/30" />
              <input
                type="email"
                name="email"
                placeholder="Email Address"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full h-14 pl-14 pr-5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:border-[#FFB800]/50 focus:ring-2 focus:ring-[#FFB800]/20 transition-all"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-white/30" />
              <input
                type="password"
                name="password"
                placeholder="Password"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={6}
                className="w-full h-14 pl-14 pr-5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:border-[#FFB800]/50 focus:ring-2 focus:ring-[#FFB800]/20 transition-all"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-white/30" />
              <input
                type="password"
                name="confirmPassword"
                placeholder="Confirm Password"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                minLength={6}
                className="w-full h-14 pl-14 pr-5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:border-[#FFB800]/50 focus:ring-2 focus:ring-[#FFB800]/20 transition-all"
              />
            </div>
            <div className="relative">
              <Building2 className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-white/30" />
              <input
                type="text"
                name="institution"
                placeholder="Institution Name"
                value={formData.institution}
                onChange={handleChange}
                required
                className="w-full h-14 pl-14 pr-5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:border-[#FFB800]/50 focus:ring-2 focus:ring-[#FFB800]/20 transition-all"
              />
            </div>
            <div className="relative">
              <Phone className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-white/30" />
              <input
                type="tel"
                name="phone"
                placeholder="Phone Number (optional)"
                value={formData.phone}
                onChange={handleChange}
                className="w-full h-14 pl-14 pr-5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:border-[#FFB800]/50 focus:ring-2 focus:ring-[#FFB800]/20 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 bg-[#FFB800] hover:bg-[#FFD700] text-gray-900 font-black rounded-2xl shadow-xl shadow-[#FFB800]/20 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {loading && <Loader2 className="h-5 w-5 animate-spin" />}
              Create Account
            </button>
          </form>

          <p className="text-center text-white/40 text-sm mt-8">
            Already have an account?{' '}
            <Link to="/login" className="text-[#FFB800] font-bold hover:text-[#FFD700] transition-colors">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
