import { useState, useEffect } from "react"
import { useAuth } from "@/context/AuthContext"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Link as LinkIcon, Building2, Plus, Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { IndustryPartner } from "@/pages/IndustryPartners"

interface SearchPartnerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinkSuccess: () => void;
  onRegisterNew: () => void;
}

export function SearchPartnerDialog({ open, onOpenChange, onLinkSuccess, onRegisterNew }: SearchPartnerDialogProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<IndustryPartner[]>([])
  const [loading, setLoading] = useState(false)
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const { authFetch } = useAuth()

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const delayDebounceFn = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await authFetch(`/api/industry-partners/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
           const data = await res.json();
           setResults(data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [query, authFetch]);

  // Reset query when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  const handleLink = async (id: string) => {
    setLinkingId(id);
    try {
      const res = await authFetch(`/api/industry-partners/${id}/link`, { method: 'POST' });
      if (res.ok) {
        toast.success("Industry Partner Linked Successfully!");
        setQuery("");
        onOpenChange(false);
        onLinkSuccess();
      } else {
        const err = await res.json();
        toast.error(err.message || "Failed to link partner");
      }
    } catch {
      toast.error("An error occurred connecting to the server");
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-white border-none rounded-[2rem] shadow-2xl overflow-hidden p-0 [&>button]:text-gray-500 hover:[&>button]:text-gray-900 [&>button]:bg-gray-100 hover:[&>button]:bg-gray-200">
        <div className="p-8">
          <DialogHeader className="mb-6">
            <DialogTitle className="text-2xl font-black">Search Industry Partners</DialogTitle>
            <DialogDescription className="font-medium text-gray-500">
              Before creating a new partner, please check if they already exist in the system.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
              <Input 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by company name..." 
                className="pl-12 h-14 bg-gray-50/50 border-gray-200 rounded-2xl focus-visible:ring-[#FFB800] text-lg font-medium"
              />
            </div>

            <div className="min-h-[200px] max-h-[350px] overflow-y-auto pr-2 space-y-3">
              {loading ? (
                <div className="flex items-center justify-center h-40 text-gray-400">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : results.length > 0 ? (
                results.map(partner => (
                  <div key={partner._id} className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between hover:border-[#FFB800]/30 transition-colors bg-white shadow-sm">
                    <div>
                      <p className="font-black text-gray-900">{partner.name}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500 font-medium mt-1">
                        <span className="bg-gray-100 px-2 py-0.5 rounded">{partner.sector}</span>
                        <span className="bg-gray-100 px-2 py-0.5 rounded">{partner.region}</span>
                      </div>
                    </div>
                    <Button 
                      onClick={() => handleLink(partner._id)}
                      disabled={linkingId === partner._id}
                      className="bg-[#FFB800]/10 text-amber-700 hover:bg-[#FFB800] hover:text-gray-900 rounded-xl font-bold transition-colors"
                    >
                      {linkingId === partner._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4 mr-2" />}
                      Link
                    </Button>
                  </div>
                ))
              ) : query.trim().length > 0 ? (
                <div className="text-center py-10">
                  <Building2 className="h-12 w-12 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium tracking-tight">No matching partners found.</p>
                </div>
              ) : (
                <div className="text-center py-10">
                  <p className="text-gray-400 font-medium">Type a company name to start searching</p>
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-gray-100/60 text-center">
              <p className="text-sm font-medium text-gray-500 mb-3">Can't find the company?</p>
              <Button 
                onClick={() => {
                  onOpenChange(false);
                  onRegisterNew();
                }}
                className="bg-gray-900 hover:bg-black text-white rounded-2xl font-bold px-8 h-12 w-full sm:w-auto shadow-lg shadow-gray-900/20"
              >
                <Plus className="h-5 w-5 mr-2" /> Register New Partner
              </Button>
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}
