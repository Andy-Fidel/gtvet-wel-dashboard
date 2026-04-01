import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function DashboardSkeleton() {
  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-black text-gray-900 tracking-tight">Dashboard Overview</h2>
      </div>

      {/* First row of 4 small cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={`top-${i}`} className="bg-white border-gray-100 rounded-[2rem] shadow-sm animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-24 bg-gray-200 rounded-md"></div>
              <div className="h-4 w-4 bg-gray-200 rounded-full"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-gray-200 rounded-md mt-2"></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Second row of 3 small cards */}
      <div className="grid gap-4 md:grid-cols-3 mt-4">
        {[1, 2, 3].map((i) => (
          <Card key={`mid-${i}`} className="bg-white border-gray-100 rounded-[2rem] shadow-sm animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-32 bg-gray-200 rounded-md"></div>
              <div className="h-4 w-4 bg-gray-200 rounded-full"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 w-20 bg-gray-200 rounded-md mt-2"></div>
              <div className="h-3 w-32 bg-gray-200 rounded-md mt-4"></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Placement Trend Chart Skeleton */}
      <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden mt-6 animate-pulse">
        <CardHeader className="p-8 pb-0">
          <div className="h-8 w-48 bg-gray-200 rounded-md"></div>
          <div className="h-4 w-64 bg-gray-200 rounded-md mt-4"></div>
        </CardHeader>
        <CardContent className="p-8">
          <div className="h-[350px] w-full bg-gray-100 rounded-xl mt-4"></div>
        </CardContent>
      </Card>

      {/* Bottom row of 3 chart cards */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 mt-6">
        {/* Gender Skeleton */}
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden animate-pulse">
          <CardHeader className="p-8 pb-0">
            <div className="h-6 w-40 bg-gray-200 rounded-md"></div>
            <div className="h-3 w-32 bg-gray-200 rounded-md mt-3"></div>
          </CardHeader>
          <CardContent className="p-8 flex flex-col items-center">
            <div className="h-32 w-32 bg-gray-200 rounded-full mt-4"></div>
            <div className="flex gap-4 mt-8">
              <div className="h-3 w-16 bg-gray-200 rounded-md"></div>
              <div className="h-3 w-16 bg-gray-200 rounded-md"></div>
            </div>
          </CardContent>
        </Card>

        {/* Trade Skeleton */}
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden animate-pulse">
          <CardHeader className="p-8 pb-0">
            <div className="h-6 w-48 bg-gray-200 rounded-md"></div>
            <div className="h-3 w-40 bg-gray-200 rounded-md mt-3"></div>
          </CardHeader>
          <CardContent className="p-8">
            <div className="space-y-4 mt-4">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-6 w-full bg-gray-200 rounded-md"></div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Avg Time Skeleton */}
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden flex flex-col justify-center items-center animate-pulse">
          <CardHeader className="p-8 pb-0 text-center flex flex-col items-center">
            <div className="h-16 w-16 bg-gray-200 rounded-2xl mb-4"></div>
            <div className="h-6 w-40 bg-gray-200 rounded-md"></div>
            <div className="h-3 w-48 bg-gray-200 rounded-md mt-3"></div>
          </CardHeader>
          <CardContent className="p-8 flex flex-col items-center">
            <div className="h-12 w-24 bg-gray-200 rounded-md mt-4"></div>
            <div className="h-4 w-12 bg-gray-200 rounded-md mt-4"></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
