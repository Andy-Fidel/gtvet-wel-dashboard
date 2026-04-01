import { useAuth } from "@/context/AuthContext"
import { FileText, Trash2, Download, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { format } from "date-fns"

interface DocumentItem {
  _id: string;
  url: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  category: string;
  uploadedBy: { _id: string; name: string };
  createdAt: string;
}

interface DocumentListProps {
  documents: DocumentItem[];
  onDelete: () => void;
  loading?: boolean;
}

const categoryColors: Record<string, string> = {
  'Placement Letter': 'bg-blue-100 text-blue-700',
  'ID Copy': 'bg-violet-100 text-violet-700',
  'Certificate': 'bg-emerald-100 text-emerald-700',
  'Assessment Form': 'bg-orange-100 text-orange-700',
  'Visit Photo': 'bg-cyan-100 text-cyan-700',
  'Report': 'bg-pink-100 text-pink-700',
  'Other': 'bg-gray-100 text-gray-600',
}

export function DocumentList({ documents, onDelete, loading }: DocumentListProps) {
  const { authFetch, user } = useAuth()

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    try {
      const res = await authFetch(`/api/documents/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      toast.success("Document deleted")
      onDelete()
    } catch {
      toast.error("Failed to delete document")
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-gray-50 rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-10">
        <FileText className="h-12 w-12 text-gray-200 mx-auto mb-3" />
        <p className="text-gray-400 font-medium text-sm">No documents uploaded yet</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {documents.map(doc => {
        const isImage = doc.fileType.startsWith('image/')
        const canDelete = user?._id === doc.uploadedBy?._id || user?.role === 'Admin' || user?.role === 'SuperAdmin'

        return (
          <div
            key={doc._id}
            className="group flex items-start gap-3 p-4 bg-white border border-gray-100 rounded-2xl hover:border-[#FFB800]/30 hover:shadow-md transition-all"
          >
            {/* Thumbnail / Icon */}
            {isImage ? (
              <a href={doc.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <img
                  src={doc.url}
                  alt={doc.fileName}
                  className="h-14 w-14 object-cover rounded-xl shadow-sm hover:shadow-md transition-shadow"
                />
              </a>
            ) : (
              <a href={doc.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <div className="h-14 w-14 rounded-xl bg-red-50 flex items-center justify-center shadow-sm hover:shadow-md transition-shadow">
                  <FileText className="h-7 w-7 text-red-500" />
                </div>
              </a>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate leading-tight">{doc.fileName}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge className={`${categoryColors[doc.category] || categoryColors['Other']} border-0 text-[10px] px-2 font-bold`}>
                  {doc.category}
                </Badge>
                <span className="text-[10px] text-gray-400 font-medium">
                  {(doc.fileSize / 1024).toFixed(0)} KB
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-gray-400">
                  {doc.uploadedBy?.name} · {format(new Date(doc.createdAt), 'MMM d, yyyy')}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="Open"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
              <a
                href={doc.url}
                download={doc.fileName}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="Download"
              >
                <Download className="h-4 w-4" />
              </a>
              {canDelete && (
                <button
                  onClick={() => handleDelete(doc._id, doc.fileName)}
                  className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
