import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, MapPin, RefreshCw } from 'lucide-react';
import GhanaMap from './GhanaMap';
import type { MapData } from './GhanaMap';

export function GeolocatedMonitoringMap() {
  const [data, setData] = useState<MapData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const { authFetch } = useAuth();

  useEffect(() => {
    let isActive = true;

    const fetchMapData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await authFetch('/api/dashboard/map-data');
        if (!res.ok) throw new Error('Regional map data could not be loaded.');

        const mapData = await res.json();
        if (isActive) setData(mapData);
      } catch (err) {
        console.error("Error fetching map data:", err);
        if (isActive) setError(err instanceof Error ? err.message : 'Regional map data could not be loaded.');
      } finally {
        if (isActive) setLoading(false);
      }
    };
    fetchMapData();

    return () => {
      isActive = false;
    };
  }, [authFetch, retryKey]);

  return (
    <Card className="bg-white border-none shadow-xl rounded-[2rem] overflow-hidden col-span-full">
      <CardHeader className="bg-gray-50/50 border-b border-gray-100 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-xl font-black text-gray-900">
            <MapPin className="h-6 w-6 text-indigo-500" />
            Regional Placement Distribution
          </CardTitle>
          <p className="text-sm font-medium text-gray-500 mt-1">Live geographical overview of active learners.</p>
        </div>
      </CardHeader>
      <CardContent className="p-0 h-[360px] md:h-[500px] w-full relative z-0 flex items-center justify-center bg-slate-50 overflow-hidden">
         {loading ? (
             <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80 z-10" role="status" aria-label="Loading regional placement map">
                 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" aria-hidden="true"></div>
             </div>
         ) : null}
         {error ? (
           <div className="relative z-10 mx-4 max-w-md rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-lg" role="alert">
             <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" />
             <p className="mt-3 font-black text-gray-900">Map temporarily unavailable</p>
             <p className="mt-1 text-sm font-medium text-gray-500">{error}</p>
             <Button type="button" variant="outline" className="mt-4 rounded-xl" onClick={() => setRetryKey((value) => value + 1)}>
               <RefreshCw className="h-4 w-4" /> Retry map
             </Button>
           </div>
         ) : (
           <div className="w-full h-full relative">
              <GhanaMap data={data} />
           </div>
         )}
      </CardContent>
    </Card>
  );
}
