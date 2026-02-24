import { useEffect, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/AuthContext"
import { Shield, Users, GraduationCap, Briefcase, ClipboardList, FileText, Building2, Download } from "lucide-react"
import { InstitutionForm } from "./InstitutionForm"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"

interface InstitutionStat {
  _id: string;
  totalLearners: number;
  placed: number;
  pending: number;
  completed: number;
  dropped: number;
}

interface RegionalStat {
  region: string;
  totalLearners: number;
  placed: number;
  institutionCount: number;
  placementRate: number;
}

interface OverviewData {
  totalUsers: number;
  totalLearners: number;
  totalPlacements: number;
  totalVisits: number;
  totalReports: number;
  totalInstitutions: number;
  institutions: string[];
  institutionDetails: any[];
  institutionStats: InstitutionStat[];
  regionalStats: RegionalStat[];
}

export default function SuperAdminDashboard() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [instOpen, setInstOpen] = useState(false);
  const [editingInstitution, setEditingInstitution] = useState<any | null>(null);
  const { authFetch } = useAuth();

  useEffect(() => {
    authFetch('http://localhost:5001/api/admin/overview')
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching overview:", err);
        setLoading(false);
      });
  }, [authFetch, refreshKey]);

  const downloadCSV = (dataset: any[], filename: string) => {
    if (!dataset.length) return;
    const headers = Object.keys(dataset[0]).join(",");
    const rows = dataset.map(item => {
      return Object.values(item).map(val => {
        const str = String(val);
        return str.includes(",") ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(",");
    });
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}-${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading system overview...</div>;
  }

  if (!data) {
    return <div className="p-8 text-center text-red-500">Failed to load overview data.</div>;
  }

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-purple-500/10 rounded-2xl">
          <Shield className="h-8 w-8 text-purple-500" />
        </div>
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">System Overview</h2>
          <p className="text-muted-foreground">Cross-institution analytics and system health</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-sm hover:shadow-xl transition-all duration-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Institutions</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-purple-600">{data.totalInstitutions}</div>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-sm hover:shadow-xl transition-all duration-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-blue-600">{data.totalUsers}</div>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-sm hover:shadow-xl transition-all duration-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Learners</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black">{data.totalLearners}</div>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-sm hover:shadow-xl transition-all duration-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Placements</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-green-600">{data.totalPlacements}</div>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-sm hover:shadow-xl transition-all duration-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Visits</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-amber-600">{data.totalVisits}</div>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-sm hover:shadow-xl transition-all duration-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reports</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-indigo-600">{data.totalReports}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-2">
        {/* Regional Breakdown */}
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
          <CardHeader className="p-8 pb-0">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-black">Regional Performance</CardTitle>
                <CardDescription className="text-base font-bold text-gray-400 mt-2">
                  Institution distribution and placement rates by region
                </CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => downloadCSV(data.regionalStats, 'regional-performance')}
                className="rounded-xl border-gray-200 hover:bg-gray-50 font-bold"
              >
                <Download className="mr-2 h-4 w-4" /> Export
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-8">
            <div className="space-y-4">
               {data.regionalStats.map((reg) => (
                  <div key={reg.region} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                    <div className="flex flex-col">
                      <span className="text-lg font-black text-gray-900">{reg.region || 'Unknown'}</span>
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                        {reg.institutionCount} Institutions • {reg.totalLearners} Learners
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className={`text-xl font-black ${reg.placementRate > 70 ? 'text-green-600' : reg.placementRate > 40 ? 'text-amber-600' : 'text-red-600'}`}>
                        {Math.round(reg.placementRate)}%
                      </span>
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Placement Rate</span>
                    </div>
                  </div>
               ))}
            </div>
          </CardContent>
        </Card>

        {/* Registered Institutions Management */}
        <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
          <CardHeader className="p-8 pb-0">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-black">School Governance</CardTitle>
                <CardDescription className="text-base font-bold text-gray-400 mt-2">
                  Add and manage registered TVET institutions
                </CardDescription>
              </div>
              <Button 
                onClick={() => { setEditingInstitution(null); setInstOpen(true); }}
                className="bg-purple-600 hover:bg-purple-700 text-white font-black rounded-xl"
              >
                Register School
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-8">
            <div className="flex flex-wrap gap-3">
              {data.institutionDetails?.map((inst) => (
                <Badge 
                  key={inst._id} 
                  onClick={() => { setEditingInstitution(inst); setInstOpen(true); }}
                  className="bg-purple-500/10 text-purple-700 border-purple-200 font-bold px-4 py-2 text-sm rounded-2xl hover:bg-purple-500/20 transition-all cursor-pointer group flex items-center gap-2"
                >
                  {inst.name}
                  <span className="text-[10px] bg-purple-200 text-purple-700 px-1.5 rounded-full group-hover:bg-purple-300">
                    {inst.code}
                  </span>
                </Badge>
              ))}
              {data.institutions.length === 0 && (
                <p className="text-center text-gray-400">No institutions registered yet.</p>
              )}
            </div>

            <Dialog open={instOpen} onOpenChange={setInstOpen}>
                <DialogContent className="sm:max-w-[600px] rounded-[2rem] border-0 shadow-2xl p-0 overflow-hidden">
                    <div className="p-8">
                        <DialogHeader className="mb-6">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-purple-500/10 rounded-2xl">
                                    <Building2 className="h-6 w-6 text-purple-500" />
                                </div>
                                <div>
                                    <DialogTitle className="text-2xl font-black">{editingInstitution ? 'Edit Institution' : 'Register New Institution'}</DialogTitle>
                                    <DialogDescription className="font-bold text-gray-400">
                                        Configure school metadata and classification.
                                    </DialogDescription>
                                </div>
                            </div>
                        </DialogHeader>
                        <InstitutionForm 
                          onSuccess={() => {
                            setInstOpen(false);
                            setRefreshKey(prev => prev + 1);
                            toast.success(editingInstitution ? "Institution updated" : "Institution registered");
                          }} 
                          initialData={editingInstitution}
                        />
                    </div>
                </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>

      {/* Institution Breakdown */}
      <Card className="bg-white border-gray-100 rounded-[2rem] shadow-xl overflow-hidden">
        <CardHeader className="p-8 pb-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-black">Institution Breakdown</CardTitle>
              <CardDescription className="text-base font-bold text-gray-400 mt-2">
                Learner distribution and placement rates per institution
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => downloadCSV(data.institutionStats, 'institutional-breakdown')}
              className="rounded-xl border-gray-200 hover:bg-gray-50 font-bold"
            >
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-8">
          {data.institutionStats.length === 0 ? (
            <p className="text-center text-gray-400 py-8">No institution data yet. Users must register and create learners.</p>
          ) : (
            <div className="space-y-4">
              {data.institutionStats.map((inst) => {
                const placementRate = inst.totalLearners > 0 
                  ? Math.round((inst.placed / inst.totalLearners) * 100) 
                  : 0;

                return (
                  <div key={inst._id} className="bg-gray-50 rounded-2xl p-6 hover:bg-gray-100 transition-colors">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-[#FFB800]/10 rounded-xl">
                          <Building2 className="h-5 w-5 text-[#FFB800]" />
                        </div>
                        <h3 className="text-lg font-black text-gray-900">{inst._id || 'Unknown'}</h3>
                      </div>
                      <Badge className="bg-[#FFB800] text-gray-900 border-0 font-black">
                        {placementRate}% placed
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="text-center">
                        <p className="text-2xl font-black text-gray-900">{inst.totalLearners}</p>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-black text-green-600">{inst.placed}</p>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Placed</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-black text-amber-600">{inst.pending}</p>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Pending</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-black text-blue-600">{inst.completed}</p>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Completed</p>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-4 w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-[#FFB800] h-2 rounded-full transition-all duration-500" 
                        style={{ width: `${placementRate}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
