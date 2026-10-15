import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import gtvetsLogo from '@/assets/gtvets_logo.png';
import workplaceBg from '@/assets/Workplace.webp';
import { InspectionBanner } from '@/components/InspectionBanner';

export const recoveryInputClassName = 'w-full h-14 pl-14 bg-white/5 border border-white/10 rounded-2xl text-white placeholder:text-white/40 focus:outline-none focus:border-[#FFB800]/50 focus:ring-2 focus:ring-[#FFB800]/20 transition-colors disabled:opacity-50';
export const recoveryButtonClassName = 'w-full min-h-14 px-4 py-4 bg-[#FFB800] hover:bg-[#FFD700] text-gray-900 font-black rounded-2xl shadow-xl shadow-[#FFB800]/20 transition-all enabled:hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB800] focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900';

export function PasswordRecoveryLayout({ title, description, children }: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8 sm:py-12 relative">
      <div aria-hidden="true" className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${workplaceBg})` }} />
      <div aria-hidden="true" className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm" />
      <div className="w-full max-w-md relative z-10">
        <InspectionBanner />
        <div className="flex flex-col items-center mb-8 sm:mb-10">
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg mb-4">
            <img src={gtvetsLogo} alt="GTVETS Logo" className="w-16 h-16 object-contain" />
          </div>
          <p className="text-2xl md:text-3xl font-black text-white tracking-tighter uppercase">GTVETS</p>
          <span className="text-xs font-bold text-[#FFB800] tracking-[0.3em] uppercase mt-1">WEL Tracker</span>
        </div>
        <section aria-labelledby="recovery-title" className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-6 sm:p-10 shadow-2xl">
          <h1 id="recovery-title" className="text-2xl font-black text-white text-center mb-2">{title}</h1>
          <p className="text-white/60 text-center text-sm mb-8 leading-relaxed">{description}</p>
          {children}
        </section>
        <div className="mt-6 text-center">
          <Link to="/login" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-white/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB800]">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
