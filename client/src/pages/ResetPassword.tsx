import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { API_BASE } from '@/config';
import { ArrowLeft, Lock, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ResetPassword() {
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
      const response = await fetch(`${API_BASE}/auth/reset-password/${token}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newPassword: password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Something went wrong');
      }

      setIsSuccess(true);
      toast.success(data.message || 'Password has been reset successfully!');
      
      // Auto redirect after 3s
      setTimeout(() => navigate('/login'), 3000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-gradient-to-br from-[#FFB800]/20 to-transparent blur-3xl" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-gradient-to-tl from-[#000000]/5 to-transparent blur-3xl" />
      
      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center mb-8">
          <div className="h-16 w-16 bg-black rounded-2xl flex items-center justify-center transform rotate-3 shadow-2xl overflow-hidden group hover:rotate-6 transition-all duration-300">
            <span className="text-white font-black text-2xl tracking-tighter group-hover:scale-110 transition-transform">GT</span>
          </div>
        </div>
        
        <h2 className="mt-4 text-center text-3xl font-black tracking-tight text-gray-900">
          Create new password
        </h2>
        <p className="mt-4 text-center text-sm text-gray-600 max-w-sm mx-auto font-medium">
          Your new password must be securely formed and at least 6 characters.
        </p>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-white/80 backdrop-blur-xl py-10 px-8 lg:px-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:rounded-[2.5rem] border border-white/20 relative">
          
          <Button 
            variant="ghost" 
            className="absolute top-4 left-4 h-10 w-10 p-0 rounded-xl bg-gray-50/50 hover:bg-gray-100 text-gray-500 hover:text-gray-900"
            onClick={() => navigate('/login')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          {isSuccess ? (
            <div className="text-center space-y-6 mt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="mx-auto w-16 h-16 bg-green-50 rounded-full flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-gray-900">Password Reset</h3>
                <p className="text-sm text-gray-500 leading-relaxed font-medium">
                  Your password has been reset successfully. You will be redirected to the login portal momentarily.
                </p>
              </div>
              <Button 
                onClick={() => navigate('/login')}
                className="w-full h-14 bg-black hover:bg-black/90 text-white rounded-2xl font-bold text-base transition-all duration-300 shadow-xl shadow-black/10 hover:shadow-black/20 hover:-translate-y-0.5"
              >
                Sign In Now
              </Button>
            </div>
          ) : (
            <form className="space-y-6 mt-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-bold text-gray-900 ml-1">
                  New Password
                </label>
                <div className="relative group">
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full h-14 pl-12 pr-4 rounded-2xl border-gray-200 bg-gray-50/50 text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-black transition-all group-hover:bg-white"
                    placeholder="Enter new password"
                  />
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-hover:text-black transition-colors" />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="block text-sm font-bold text-gray-900 ml-1">
                  Confirm Password
                </label>
                <div className="relative group">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full h-14 pl-12 pr-4 rounded-2xl border-gray-200 bg-gray-50/50 text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-black transition-all group-hover:bg-white"
                    placeholder="Confirm new password"
                  />
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-hover:text-black transition-colors" />
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={isLoading || !password || !confirmPassword}
                  className="w-full h-14 bg-[#FFB800] hover:bg-[#FFB800]/90 text-black rounded-2xl font-black text-base transition-all duration-300 shadow-xl shadow-[#FFB800]/20 hover:shadow-[#FFB800]/30 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                      <span>Resetting...</span>
                    </div>
                  ) : (
                    'Reset Password'
                  )}
                </Button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
