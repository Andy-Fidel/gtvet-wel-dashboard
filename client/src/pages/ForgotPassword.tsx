import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { API_BASE } from '@/config';
import { ArrowLeft, Mail } from 'lucide-react';
import { toast } from 'sonner';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
          Reset your password
        </h2>
        <p className="mt-4 text-center text-sm text-gray-600 max-w-sm mx-auto font-medium">
          Enter your email address and we'll send you a link to reset your password.
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

          {isSent ? (
            <div className="text-center space-y-6 mt-4">
              <div className="mx-auto w-16 h-16 bg-green-50 rounded-full flex items-center justify-center">
                <Mail className="h-8 w-8 text-green-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-gray-900">Check your email</h3>
                <p className="text-sm text-gray-500 leading-relaxed font-medium">
                  If an account exists for <span className="text-gray-900 font-bold">{email}</span>, we have sent a password reset link.
                </p>
              </div>
              <Button 
                onClick={() => navigate('/login')}
                className="w-full h-14 bg-black hover:bg-black/90 text-white rounded-2xl font-bold text-base transition-all duration-300 shadow-xl shadow-black/10 hover:shadow-black/20 hover:-translate-y-0.5"
              >
                Return to Login
              </Button>
            </div>
          ) : (
            <form className="space-y-8 mt-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-bold text-gray-900 ml-1">
                  Email Address
                </label>
                <div className="relative group">
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full h-14 pl-12 pr-4 rounded-2xl border-gray-200 bg-gray-50/50 text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-black transition-all group-hover:bg-white"
                    placeholder="Enter your registered email"
                  />
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-hover:text-black transition-colors" />
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={isLoading || !email}
                  className="w-full h-14 bg-[#FFB800] hover:bg-[#FFB800]/90 text-black rounded-2xl font-black text-base transition-all duration-300 shadow-xl shadow-[#FFB800]/20 hover:shadow-[#FFB800]/30 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                      <span>Sending Link...</span>
                    </div>
                  ) : (
                    'Send Reset Link'
                  )}
                </Button>
              </div>
            </form>
          )}

        </div>
        
        <p className="mt-8 text-center text-sm font-medium text-gray-500">
          Remember your password?{' '}
          <Link to="/login" className="font-bold text-black hover:underline underline-offset-4 decoration-2 decoration-[#FFB800]">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
