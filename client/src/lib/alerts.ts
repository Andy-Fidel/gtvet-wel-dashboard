import type { ReactNode } from 'react'
import type { ExternalToast, ToastT } from 'sonner'

export type AlertKind = 'error' | 'success' | 'warning'
export type AlertMessage = ReactNode | (() => ReactNode)
export type AppAlert = {
  id: string | number
  kind: AlertKind
  message: AlertMessage
  options: ExternalToast
  returnFocus: HTMLElement | null
  returnPageFocus: HTMLElement | null
}

let alerts: AppAlert[] = []
let sequence = 0
let lastFocused: HTMLElement | null = null
let lastPageFocused: HTMLElement | null = null
export function trackAlertFocus(event: FocusEvent) {
  if (alerts.length || !(event.target instanceof HTMLElement) || event.target.closest('[data-app-alert]')) return
  lastFocused = event.target
  if (!event.target.closest('[role="dialog"], [role="alertdialog"]')) lastPageFocused = event.target
}
const subscribers = new Set<() => void>()
const publish = () => subscribers.forEach(listener => listener())
export const getAlerts = () => alerts
export const subscribeAlerts = (listener: () => void) => {
  subscribers.add(listener)
  return () => { subscribers.delete(listener) }
}

// Keep confirmations until acknowledged; never store potentially sensitive messages on disk.
export function showAlert(kind: AlertKind, message: AlertMessage, options: ExternalToast = {}) {
  const existing = alerts.find(alert => options.id !== undefined
    ? alert.id === options.id
    : typeof message === 'string' && alert.kind === kind && alert.message === message
      && alert.options.description === options.description && !options.action && !options.onDismiss)
  if (existing) {
    if (options.id !== undefined) {
      alerts = alerts.map(alert => alert.id === existing.id ? { ...alert, kind, message, options } : alert)
      publish()
    }
    return existing.id
  }
  const focused = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null
  const alert: AppAlert = { id: options.id ?? `app-alert-${++sequence}`, kind, message, options,
    returnFocus: alerts[0]?.returnFocus ?? (focused?.tagName === 'BODY' ? lastFocused : focused),
    returnPageFocus: alerts[0]?.returnPageFocus ?? lastPageFocused }
  alerts = [...alerts, alert]
  publish()
  return alert.id
}

export function dismissAlert(id?: string | number, acknowledged = false) {
  const removed = alerts.filter(alert => id === undefined || alert.id === id)
  alerts = alerts.filter(alert => !removed.includes(alert))
  if (removed.length) publish()
  if (acknowledged) removed.forEach(alert => alert.options.onDismiss?.({ ...alert.options, id: alert.id, type: alert.kind, title: alert.message } as ToastT))
}
