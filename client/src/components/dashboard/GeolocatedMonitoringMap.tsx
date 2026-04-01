import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { MapPin } from 'lucide-react';
import GhanaMap from './GhanaMap';
import type { MapData } from './GhanaMap';

export function GeolocatedMonitoringMap() {
  const [data, setData] = useState<MapData[]>([]);
  const [loading, setLoading] = useState(true);
  const { authFetch } = useAuth();

  useEffect(() => {
    const fetchMapData = async () => {
      try {
        const res = await authFetch('/api/dashboard/map-data');
        if (res.ok) {
          const mapData = await res.json();
          setData(mapData);
        }
      } catch (err) {
        console.error("Error fetching map data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchMapData();
  }, [authFetch]);

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
      <CardContent className="p-0 h-[500px] w-full relative z-0 flex items-center justify-center bg-slate-50 overflow-hidden">
         {loading ? (
             <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80 z-10">
                 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
             </div>
         ) : null}
         <div className="w-full h-full relative">
            <GhanaMap data={data} />
         </div>
      </CardContent>
    </Card>
  );
}

