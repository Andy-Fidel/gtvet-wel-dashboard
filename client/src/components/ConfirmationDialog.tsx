import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Loader2 } from "lucide-react"
import { useState } from "react"

interface ConfirmationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Additional context rendered below the description */
  children?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: "danger" | "warning" | "default"
  onConfirm: () => void | Promise<void>
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
}: ConfirmationDialogProps) {
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm()
    } finally {
      setLoading(false)
    }
  }

  const confirmBtnClass =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-700 text-white"
      : variant === "warning"
        ? "bg-amber-500 hover:bg-amber-600 text-white"
        : "bg-[#FFB800] hover:bg-[#e5a600] text-gray-900"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="bg-black/45 backdrop-blur-md" className="sm:max-w-[440px] bg-white border-none rounded-[2rem] shadow-2xl overflow-hidden p-0">
        <div className="p-8">
          <DialogHeader className="mb-4">
            <div className="flex items-center gap-3 mb-2">
              {variant === "danger" && (
                <div className="p-2.5 bg-red-50 rounded-xl">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
              )}
              {variant === "warning" && (
                <div className="p-2.5 bg-amber-50 rounded-xl">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                </div>
              )}
              <DialogTitle className="text-xl font-black text-gray-900">{title}</DialogTitle>
            </div>
            {description && (
              <DialogDescription className="font-medium text-gray-500 text-sm">
                {description}
              </DialogDescription>
            )}
          </DialogHeader>

          {children && <div className="mb-6">{children}</div>}

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
              onClick={handleConfirm}
              disabled={loading}
              className={`rounded-xl font-bold ${confirmBtnClass}`}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
