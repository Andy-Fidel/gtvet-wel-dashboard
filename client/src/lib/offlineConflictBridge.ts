const OFFLINE_CONFLICT_BRIDGE_KEY = "gtvets-offline-conflict-bridge"

export type OfflineConflictBridgePayload = {
  type: "monitoring-visit" | "attendance-log" | "support-ticket" | "support-reply"
  payload: Record<string, unknown>
  ticketId?: string
}

export const setOfflineConflictBridge = (value: OfflineConflictBridgePayload) => {
  if (typeof window === "undefined") return
  window.sessionStorage.setItem(OFFLINE_CONFLICT_BRIDGE_KEY, JSON.stringify(value))
}

export const getOfflineConflictBridge = (): OfflineConflictBridgePayload | null => {
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(OFFLINE_CONFLICT_BRIDGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as OfflineConflictBridgePayload
  } catch {
    return null
  }
}

export const clearOfflineConflictBridge = () => {
  if (typeof window === "undefined") return
  window.sessionStorage.removeItem(OFFLINE_CONFLICT_BRIDGE_KEY)
}
