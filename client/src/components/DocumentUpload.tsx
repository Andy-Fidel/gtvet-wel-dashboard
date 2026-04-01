import { useState, useRef } from "react"
import { useAuth } from "@/context/AuthContext"
import { Upload, X, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface DocumentUploadProps {
  learnerId?: string;
  placementId?: string;
  monitoringVisitId?: string;
  onUploadSuccess: () => void;
}

const CATEGORIES = [
  'Placement Letter',
  'ID Copy',
  'Certificate',
  'Assessment Form',
  'Visit Photo',
  'Report',
  'Other',
]

export function DocumentUpload({ learnerId, placementId, monitoringVisitId, onUploadSuccess }: DocumentUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [category, setCategory] = useState("Other")
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { token } = useAuth()

  const handleFile = (f: File) => {
    setFile(f)
    if (f.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => setPreview(e.target?.result as string)
      reader.readAsDataURL(f)
    } else {
      setPreview(null)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', category)
      if (learnerId) formData.append('learnerId', learnerId)
      if (placementId) formData.append('placementId', placementId)
      if (monitoringVisitId) formData.append('monitoringVisitId', monitoringVisitId)

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Upload failed')
      }

      toast.success("Document uploaded successfully!")
      setFile(null)
      setPreview(null)
      setCategory("Other")
      onUploadSuccess()
    } catch (err) {
      const e = err as Error
      toast.error("Upload failed", { description: e.message })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-2xl p-4 md:p-6 text-center cursor-pointer
          transition-all duration-300 group
          ${dragActive ? 'border-[#FFB800] bg-[#FFB800]/5 scale-[1.01]' : 'border-gray-200 hover:border-[#FFB800]/50 hover:bg-gray-50/50'}
          ${file ? 'border-emerald-300 bg-emerald-50/50' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.doc,.docx"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        {file ? (
          <div className="flex flex-col items-center gap-2 justify-center">
            {preview ? (
              <img src={preview} alt="Preview" className="h-16 w-16 object-cover rounded-xl shadow-md mx-auto" />
            ) : (
              <div className="h-16 w-16 rounded-xl bg-red-50 flex items-center justify-center shadow-md mx-auto">
                <FileText className="h-8 w-8 text-red-500" />
              </div>
            )}
            <div className="text-center w-full px-2">
              <p className="font-bold text-gray-900 text-xs truncate max-w-full">{file.name}</p>
              <p className="text-[10px] text-gray-500 font-medium">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null) }}
              className="p-1.5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors mt-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-[#FFB800]/10 flex items-center justify-center mx-auto group-hover:bg-[#FFB800]/20 transition-colors">
              <Upload className="h-6 w-6 text-[#FFB800]" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-700">Drop file or click</p>
              <p className="text-[10px] text-gray-400 mt-1 font-medium italic">Max 10MB</p>
            </div>
          </div>
        )}
      </div>

      {/* Category + Upload */}
      {file && (
        <div className="flex items-center gap-3">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="flex-1 h-12 px-4 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#FFB800] focus:border-transparent"
          >
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <Button
            onClick={handleUpload}
            disabled={uploading}
            className="h-12 px-6 bg-[#FFB800] hover:bg-[#FFD700] text-gray-900 font-bold rounded-xl shadow-lg shadow-[#FFB800]/20 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5 mr-2" />}
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </div>
      )}
    </div>
  )
}
