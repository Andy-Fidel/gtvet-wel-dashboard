import { useState, useEffect } from "react"
import { useAuth } from "@/context/AuthContext"
import { Plus, Building2, MapPin, Phone, Mail, Link as LinkIcon, BarChart2, UserPlus, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import { IndustryPartnerForm } from "./IndustryPartnerForm"
import { SearchPartnerDialog } from "@/components/SearchPartnerDialog"

export type IndustryPartner = {
  _id: string;
  name: string;
  sector: string;
  region: string;
  location?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  website?: string;
  totalSlots: number;
  usedSlots: number;
  status: 'Active' | 'Inactive';
  programs: string[];
  mouDocumentUrl?: string;
}

export default function IndustryPartners() {
  const [partners, setPartners] = useState<IndustryPartner[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [editingPartner, setEditingPartner] = useState<IndustryPartner | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const { authFetch, user } = useAuth()

  useEffect(() => {
    const fetchPartners = async () => {
      try {
        const res = await authFetch('/api/industry-partners')
        if (!res.ok) throw new Error("Failed to fetch")
        const data = await res.json()
        setPartners(data)
      } catch (err) {
        console.error("Error fetching partners:", err)
        toast.error("Failed to load industry partners")
      } finally {
        setLoading(false)
      }
    }
    fetchPartners()
  }, [refreshKey, authFetch])

  const handleSuccess = () => {
    setOpen(false)
    setEditingPartner(null)
    setRefreshKey(prev => prev + 1)
    toast.success(editingPartner ? "Partner updated" : "Partner created")
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this partner?")) return;
    try {
      const res = await authFetch(`/api/industry-partners/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error("Failed to delete")
      setRefreshKey(prev => prev + 1)
      toast.success("Industry partner deleted")
    } catch {
      toast.error("Error deleting partner")
    }
  }

  const handleCreateAccount = async (id: string, email?: string) => {
    if (!email) {
        toast.error("Partner missing contact email", { description: "An email is required to create a portal account." })
        return;
    }
    try {
      toast.info("Creating account...")
      const res = await authFetch(`/api/industry-partners/${id}/create-account`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Failed to create account")
      
      toast.success("Account Created", { 
          description: `Temporary Password: ${data.defaultPassword}`,
          duration: 10000 
      })
    } catch (err) {
      const e = err as Error;
      toast.error("Error", { description: e.message })
    }
  }

  return (
    <div className="flex-1 space-y-8 p-8 flex flex-col items-center max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between w-full">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Building2 className="h-6 w-6 md:h-8 md:w-8 text-[#FFB800]" />
            Industry Partners
          </h2>
          <p className="text-muted-foreground mt-1 font-medium">Manage companies providing placement opportunities.</p>
        </div>
        {['SuperAdmin', 'RegionalAdmin', 'Admin', 'Manager'].includes(user?.role || '') && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center w-full md:w-auto mt-4 md:mt-0 space-y-2 sm:space-y-0 sm:space-x-2">
                    <Button onClick={() => { setEditingPartner(null); setSearchOpen(true); }} className="bg-[#FFB800] hover:bg-[#FFD700] text-gray-900 font-black h-12 px-6 rounded-2xl shadow-lg shadow-[#FFB800]/20 hover:-translate-y-0.5 transition-all">
              <Plus className="mr-2 h-5 w-5" /> Add Partner
            </Button>
          </div>
        )}
      </div>

      <SearchPartnerDialog 
        open={searchOpen} 
        onOpenChange={setSearchOpen}
        onLinkSuccess={() => setRefreshKey(prev => prev + 1)}
        onRegisterNew={() => {
          setEditingPartner(null);
          setOpen(true);
        }}
      />

      <Dialog open={open} onOpenChange={(val) => {
        setOpen(val)
        if (!val) setEditingPartner(null)
      }}>
        <DialogContent className="sm:max-w-[600px] bg-white border-none rounded-[2rem] shadow-2xl overflow-hidden p-0 [&>button]:text-gray-500 hover:[&>button]:text-gray-900 [&>button]:bg-gray-100 hover:[&>button]:bg-gray-200">
          <div className="p-8">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-2xl font-black">{editingPartner ? 'Edit Partner' : 'Register New Partner'}</DialogTitle>
              <DialogDescription className="font-medium text-gray-500">
                Enter company details and capacity.
              </DialogDescription>
            </DialogHeader>
            <IndustryPartnerForm onSuccess={handleSuccess} initialData={editingPartner || undefined} />
          </div>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="w-full text-center p-12 text-gray-400 font-bold animate-pulse">Loading partners...</div>
      ) : partners.length === 0 ? (
        <div className="w-full text-center p-16 bg-white/50 border border-dashed border-gray-300 rounded-[2.5rem]">
          <Building2 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-black text-gray-500 tracking-tight">No partners found</h3>
          <p className="text-gray-400 mt-2 font-medium">Add some industry partners to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
          {partners.map(partner => (
            <Card key={partner._id} className="bg-white border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 rounded-[2rem] overflow-hidden group">
              <div className="h-2 w-full bg-[#FFB800]" />
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start">
                  <div>
                     <CardTitle className="text-xl font-black text-gray-900 leading-tight group-hover:text-[#FFB800] transition-colors">{partner.name}</CardTitle>
                     <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold leading-5 bg-gray-100 text-gray-600 mt-2 uppercase tracking-wide">
                        {partner.sector}
                     </span>
                  </div>
                  {partner.status === 'Active' ? (
                     <div className="h-3 w-3 rounded-full bg-emerald-400 border-2 border-white shadow-sm" title="Active"></div>
                  ) : (
                     <div className="h-3 w-3 rounded-full bg-red-400 border-2 border-white shadow-sm" title="Inactive"></div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm font-medium text-gray-500">
                    <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        <span className="truncate" title={partner.region}>{partner.region}</span>
                    </div>
                    {partner.contactPhone && (
                        <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-gray-400" />
                            <span className="truncate">{partner.contactPhone}</span>
                        </div>
                    )}
                    {partner.contactEmail && (
                        <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-gray-400" />
                            <span className="truncate" title={partner.contactEmail}>{partner.contactEmail}</span>
                        </div>
                    )}
                    {partner.website && (
                       <div className="flex items-center gap-2">
                           <LinkIcon className="h-4 w-4 text-gray-400" />
                           <a href={partner.website} target="_blank" rel="noreferrer" className="truncate text-blue-500 hover:underline">Website</a>
                       </div>
                    )}
                    {partner.mouDocumentUrl && (
                       <div className="flex items-center gap-2">
                           <FileText className="h-4 w-4 text-green-500" />
                           <a href={partner.mouDocumentUrl} target="_blank" rel="noreferrer" className="truncate text-green-600 font-bold hover:underline">View MoU</a>
                       </div>
                    )}
                </div>

                <div className="bg-gray-50/50 rounded-2xl p-4 border border-gray-100/50 mt-4">
                    <div className="flex items-center justify-between mb-2">
                         <span className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5"><BarChart2 className="h-4 w-4 text-[#FFB800]"/> Capacity</span>
                         <span className="text-sm font-black text-gray-900">{partner.usedSlots} / {partner.totalSlots}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                        <div 
                         className={`h-1.5 rounded-full transition-all duration-500 ${partner.usedSlots >= partner.totalSlots ? 'bg-red-500' : 'bg-[#10b981]'}`}
                         style={{ width: `${partner.totalSlots > 0 ? Math.min((partner.usedSlots / partner.totalSlots) * 100, 100) : 0}%` }}
                        ></div>
                    </div>
                </div>

                {(user?.role === 'SuperAdmin' || user?.role === 'RegionalAdmin') && (
                    <div className="flex gap-2 pt-2 border-t border-gray-100 mt-4">
                         <Button variant="outline" size="sm" onClick={() => handleCreateAccount(partner._id, partner.contactEmail)} className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 font-bold h-9">
                             <UserPlus className="h-4 w-4 mr-2" /> Portal
                         </Button>
                         <Button variant="outline" size="sm" onClick={() => { setEditingPartner(partner); setOpen(true); }} className="flex-1 hover:bg-[#FFB800]/10 hover:text-[#FFB800] border-gray-200 font-bold h-9">
                             Edit
                         </Button>
                         {user?.role === 'SuperAdmin' && (
                             <Button variant="outline" size="sm" onClick={() => handleDelete(partner._id)} className="hover:bg-red-50 hover:text-red-500 border-gray-200 font-bold h-9 px-3">
                                 Delete
                             </Button>
                         )}
                    </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
