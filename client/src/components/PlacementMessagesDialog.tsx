import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { MessageSquare, Reply, Send, X } from "lucide-react"

type PlacementSummary = {
  _id: string
  companyName: string
  institution?: string
  status: string
  learner?: {
    _id: string
    name: string
    trackingId?: string
    program?: string
  }
  partner?: {
    _id: string
    name: string
  } | null
}

type PlacementMessage = {
  _id: string
  message: string
  senderName: string
  senderRole: string
  createdAt: string
  senderUser?: {
    _id: string
    profilePicture?: string
  }
  replyTo?: {
    _id: string
    message: string
    senderName: string
    createdAt: string
  } | null
}

interface PlacementMessagesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  placementId: string | null
  authFetch: (url: string, options?: RequestInit) => Promise<Response>
  currentUserId?: string
  onMessageCreated?: (placementId: string, createdAt: string) => void
  onConversationRead?: (placementId: string) => void
}

export function PlacementMessagesDialog({
  open,
  onOpenChange,
  placementId,
  authFetch,
  currentUserId,
  onMessageCreated,
  onConversationRead,
}: PlacementMessagesDialogProps) {
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [placement, setPlacement] = useState<PlacementSummary | null>(null)
  const [messages, setMessages] = useState<PlacementMessage[]>([])
  const [draft, setDraft] = useState("")
  const [replyTo, setReplyTo] = useState<PlacementMessage | null>(null)

  useEffect(() => {
    if (!open || !placementId) return

    const controller = new AbortController()
    setLoading(true)

    authFetch(`/api/placements/${placementId}/messages`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const error = await res.json().catch(() => null)
          throw new Error(error?.message || "Failed to load conversation")
        }
        return res.json()
      })
      .then((data) => {
        setPlacement(data.placement)
        setMessages(data.messages)
        onConversationRead?.(placementId)
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          console.error(error)
          toast.error(error.message || "Failed to load conversation")
        }
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [open, placementId, authFetch, onConversationRead])

  useEffect(() => {
    if (!open) {
      setDraft("")
      setReplyTo(null)
    }
  }, [open])

  const handleSend = async () => {
    if (!placementId || !draft.trim()) return

    setSubmitting(true)
    try {
      const res = await authFetch(`/api/placements/${placementId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          message: draft.trim(),
          replyTo: replyTo?._id || undefined,
        }),
      })

      if (!res.ok) {
        const error = await res.json().catch(() => null)
        throw new Error(error?.message || "Failed to send message")
      }

      const createdMessage = await res.json()
      setMessages((current) => [...current, createdMessage])
      setDraft("")
      setReplyTo(null)
      onMessageCreated?.(placementId, createdMessage.createdAt)
      toast.success("Message sent")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send message"
      console.error(error)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  const initials = (name: string) =>
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="bg-black/45 backdrop-blur-md" className="sm:max-w-3xl max-h-[90vh] overflow-hidden p-0 gap-0">
        <DialogHeader className="border-b border-slate-200 px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-xl font-black text-white">
            <MessageSquare className="h-5 w-5 text-indigo-400" />
            Placement Conversation
          </DialogTitle>
          <DialogDescription className="space-y-2 pt-1 text-slate-200">
            <span className="block">
              Thread for {placement?.learner?.name || "this learner"} at {placement?.companyName || "the placement site"}.
            </span>
            {placement && (
              <span className="flex flex-wrap gap-2">
                <Badge variant="outline">{placement.learner?.trackingId || "No Tracking ID"}</Badge>
                <Badge variant="outline">{placement.institution || "No Institution"}</Badge>
                {placement.partner?.name ? <Badge variant="outline">{placement.partner.name}</Badge> : null}
                <Badge variant="outline">{placement.status}</Badge>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex h-[70vh] flex-col">
          <div className="flex-1 overflow-y-auto bg-slate-50 px-6 py-5">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full rounded-2xl" />
                <Skeleton className="ml-auto h-24 w-[80%] rounded-2xl" />
                <Skeleton className="h-24 w-[85%] rounded-2xl" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white px-6 text-center">
                <MessageSquare className="mb-4 h-12 w-12 text-slate-300" />
                <p className="text-lg font-bold text-slate-700">No messages yet</p>
                <p className="mt-1 max-w-md text-sm text-slate-500">
                  Start the placement thread for the learner, institution team, and industry partner.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => {
                  const isOwnMessage = message.senderUser?._id === currentUserId
                  return (
                    <div
                      key={message._id}
                      className={`flex gap-3 ${isOwnMessage ? "justify-end" : "justify-start"}`}
                    >
                      {!isOwnMessage ? (
                        <Avatar className="mt-1 h-10 w-10 border border-slate-200">
                          <AvatarImage src={message.senderUser?.profilePicture} />
                          <AvatarFallback>{initials(message.senderName)}</AvatarFallback>
                        </Avatar>
                      ) : null}

                      <div
                        className={`max-w-[85%] rounded-3xl border px-4 py-3 shadow-sm ${
                          isOwnMessage
                            ? "border-indigo-200 bg-indigo-600 text-white"
                            : "border-slate-200 bg-white text-slate-900"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                          <span>{message.senderName}</span>
                          <Badge
                            variant="outline"
                            className={isOwnMessage ? "border-indigo-200 bg-indigo-500/40 text-white" : ""}
                          >
                            {message.senderRole}
                          </Badge>
                          <span className={isOwnMessage ? "text-indigo-100" : "text-slate-500"}>
                            {new Date(message.createdAt).toLocaleString()}
                          </span>
                        </div>

                        {message.replyTo ? (
                          <button
                            type="button"
                            onClick={() =>
                              setReplyTo({
                                _id: message.replyTo!._id,
                                message: message.replyTo!.message,
                                senderName: message.replyTo!.senderName,
                                senderRole: "",
                                createdAt: message.replyTo!.createdAt,
                              })
                            }
                            className={`mt-3 block w-full rounded-2xl border px-3 py-2 text-left text-xs ${
                              isOwnMessage
                                ? "border-indigo-200/70 bg-indigo-500/40 text-indigo-50"
                                : "border-slate-200 bg-slate-50 text-slate-600"
                            }`}
                          >
                            Replying to {message.replyTo.senderName}: {message.replyTo.message}
                          </button>
                        ) : null}

                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{message.message}</p>

                        <div className="mt-3 flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={isOwnMessage ? "text-white hover:bg-indigo-500 hover:text-white" : ""}
                            onClick={() => setReplyTo(message)}
                          >
                            <Reply className="mr-2 h-4 w-4" />
                            Reply
                          </Button>
                        </div>
                      </div>

                      {isOwnMessage ? (
                        <Avatar className="mt-1 h-10 w-10 border border-indigo-200">
                          <AvatarImage src={message.senderUser?.profilePicture} />
                          <AvatarFallback>{initials(message.senderName)}</AvatarFallback>
                        </Avatar>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 bg-white px-6 py-5">
            {replyTo ? (
              <div className="mb-3 flex items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Replying to {replyTo.senderName}</p>
                  <p className="truncate text-sm text-amber-900">{replyTo.message}</p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setReplyTo(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : null}

            <div className="space-y-3">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Write a message for this placement thread..."
                className="min-h-[120px] resize-none rounded-2xl border-slate-200"
              />
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={handleSend}
                  disabled={submitting || !draft.trim()}
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-700"
                >
                  <Send className="mr-2 h-4 w-4" />
                  {submitting ? "Sending..." : "Send message"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
