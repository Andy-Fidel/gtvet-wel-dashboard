import { Skeleton } from '@/components/ui/skeleton';

export function PageSkeleton() {
  return (
    <div className="flex-1 p-8 space-y-8 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64 rounded-xl" />
          <Skeleton className="h-4 w-40 rounded-lg" />
        </div>
        <Skeleton className="h-12 w-36 rounded-2xl" />
      </div>

      {/* Stat Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white/60 rounded-[2rem] p-6 space-y-3">
            <Skeleton className="h-4 w-24 rounded-lg" />
            <Skeleton className="h-10 w-20 rounded-xl" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="bg-white/60 rounded-[2rem] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32 rounded-lg" />
          <Skeleton className="h-10 w-48 rounded-xl" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
