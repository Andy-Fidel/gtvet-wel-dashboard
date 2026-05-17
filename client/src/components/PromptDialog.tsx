import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"
import { useState, useEffect } from "react"

interface PromptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Label for the text input */
  label?: string
  placeholder?: string
  /** Pre-filled value */
  defaultValue?: string
  /** Use textarea for multi-line input */
  multiline?: boolean
  /** Whether the input is required to submit */
  required?: boolean
  submitLabel?: string
  cancelLabel?: string
  onSubmit: (value: string) => void | Promise<void>
}

export function PromptDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder = "",
  defaultValue = "",
  multiline = true,
  required = false,
  submitLabel = "Submit",
  cancelLabel = "Cancel",
  onSubmit,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue)
  const [loading, setLoading] = useState(false)

  // Reset value when dialog opens with a new defaultValue
  useEffect(() => {
    if (open) setValue(defaultValue)
  }, [open, defaultValue])

  const handleSubmit = async () => {
    if (required && !value.trim()) return
    setLoading(true)
    try {
      await onSubmit(value.trim())
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="bg-black/45 backdrop-blur-md" className="sm:max-w-[500px] bg-white border-none rounded-[2rem] shadow-2xl overflow-hidden p-0">
        <div className="p-8">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-black text-gray-900">{title}</DialogTitle>
            {description && (
              <DialogDescription className="font-medium text-gray-500 text-sm">
                {description}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-3 mb-6">
            {label && (
              <label className="text-sm font-semibold text-gray-900">{label}</label>
            )}
            {multiline ? (
              <Textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                className="min-h-[120px] rounded-xl border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus-visible:ring-indigo-500/30"
              />
            ) : (
              <Input
                value={value}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
                placeholder={placeholder}
                className="h-12 rounded-xl border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus-visible:ring-indigo-500/30"
              />
            )}
          </div>

          <DialogFooter className="flex gap-3 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="rounded-xl border-gray-200 font-bold"
            >
              {cancelLabel}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading || (required && !value.trim())}
              className="rounded-xl font-bold bg-[#FFB800] hover:bg-[#e5a600] text-gray-900"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
