import { isValidElement, useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { CircleAlert, CircleCheck, TriangleAlert, X } from 'lucide-react'
import { Toaster } from 'sonner'
import type { Action } from 'sonner'
import { Button } from '@/components/ui/button'
import { dismissAlert, getAlerts, subscribeAlerts, trackAlertFocus } from '@/lib/alerts'
import type { AlertMessage, AppAlert } from '@/lib/alerts'
import { useAuth } from '@/context/AuthContext'
import { toast } from '@/lib/toast'

const appearance = {
  error: { title: 'Unable to complete action', icon: CircleAlert, color: 'bg-red-50 text-red-700', border: 'border-red-200' },
  success: { title: 'Success', icon: CircleCheck, color: 'bg-emerald-50 text-emerald-700', border: 'border-emerald-200' },
  warning: { title: 'Action needs attention', icon: TriangleAlert, color: 'bg-amber-50 text-amber-800', border: 'border-amber-200' },
}
const renderMessage = (message: AlertMessage) => typeof message === 'function' ? message() : message
const isAction = (value: unknown): value is Action => !!value && typeof value === 'object' && 'onClick' in value && 'label' in value

function AlertDialog({ alert, remaining }: { alert: AppAlert; remaining: number }) {
  const heading = useRef<HTMLHeadingElement>(null)
  const theme = appearance[alert.kind]
  const Icon = theme.icon
  const close = () => dismissAlert(alert.id, true)
  const restoreFocus = () => {
    if (getAlerts().length) return
    for (const target of [alert.returnFocus, alert.returnPageFocus]) {
      if (target?.isConnected && !target.matches(':disabled') && !target.closest('[aria-hidden="true"], [inert]')) {
        target.focus({ preventScroll: true })
        if (document.activeElement === target) return
      }
    }
    // The operation may have closed its form or navigated to a different page.
    const fallback = document.querySelector<HTMLElement>('[role="dialog"][data-state="open"] button:not(:disabled), main button:not(:disabled), main a[href], main input:not(:disabled), h1, h2')
    if (fallback) {
      const previous = fallback.getAttribute('tabindex')
      fallback.setAttribute('tabindex', '-1')
      fallback.focus({ preventScroll: true })
      if (previous === null) fallback.removeAttribute('tabindex')
      else fallback.setAttribute('tabindex', previous)
    }
  }
  const actionButton = (value: typeof alert.options.action, cancel = false) => {
    if (isValidElement(value)) return value
    if (!isAction(value)) return null
    return <Button type="button" variant={cancel ? 'outline' : 'default'} onClick={event => {
      value.onClick(event)
      if (!event.defaultPrevented) close()
    }}>{value.label}</Button>
  }
  return <Dialog.Root open onOpenChange={open => { if (!open) close() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[200] bg-slate-900/45 backdrop-blur-sm" />
      <Dialog.Content
        data-app-alert=""
        role={alert.kind === 'error' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        className={`fixed left-1/2 top-1/2 z-[201] flex -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[2rem] border bg-white text-slate-900 shadow-2xl ${theme.border}`}
        style={{ width: 'min(32rem, calc(100vw - 2rem))', maxHeight: 'calc(100dvh - 2rem)' }}
        onOpenAutoFocus={event => { event.preventDefault(); heading.current?.focus() }}
        onCloseAutoFocus={event => { event.preventDefault(); restoreFocus() }}
        onPointerDownOutside={event => event.preventDefault()}
        onInteractOutside={event => event.preventDefault()}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-5 py-4 pr-16 sm:px-6 sm:pr-16">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${theme.color}`}><Icon aria-hidden="true" className="h-6 w-6" /></span>
          <Dialog.Title ref={heading} tabIndex={-1} className="text-lg font-black tracking-tight outline-none sm:text-xl">{theme.title}</Dialog.Title>
        </div>
        <Dialog.Description asChild>
          <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-5 text-sm leading-6 sm:px-6">
            <div className="whitespace-pre-wrap break-words font-semibold">{renderMessage(alert.message)}</div>
            {alert.options.description && <div className="mt-3 whitespace-pre-wrap break-words text-slate-600">{renderMessage(alert.options.description)}</div>}
          </div>
        </Dialog.Description>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-4 sm:px-6">
          {remaining > 0 && <span className="mr-auto text-xs text-slate-500">{remaining} more {remaining === 1 ? 'message' : 'messages'}</span>}
          {actionButton(alert.options.cancel, true)}
          {actionButton(alert.options.action)}
          <Button type="button" onClick={close} className="min-h-11 rounded-xl bg-[#FFB800] px-6 font-bold text-slate-900 hover:bg-[#FFD700] focus-visible:ring-amber-500">Close</Button>
        </div>
        <Dialog.Close aria-label={`Close ${alert.kind} message`} className="absolute right-3 top-4 flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"><X aria-hidden="true" className="h-5 w-5" /></Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}

export function AppAlerts() {
  useEffect(() => {
    document.addEventListener('focusin', trackAlertFocus)
    return () => document.removeEventListener('focusin', trackAlertFocus)
  }, [])
  const { user } = useAuth()
  const previousUser = useRef(user?._id)
  useEffect(() => {
    if (previousUser.current && previousUser.current !== user?._id) toast.dismiss()
    previousUser.current = user?._id
  }, [user?._id])
  const alerts = useSyncExternalStore(subscribeAlerts, getAlerts, getAlerts)
  return <>
    {createPortal(<Toaster position="top-right" offset={24} closeButton style={{ zIndex: 190 }} toastOptions={{ closeButtonAriaLabel: 'Dismiss notification', className: 'rounded-2xl text-sm shadow-xl' }} />, document.body)}
    {alerts[0] && <AlertDialog key={alerts[0].id} alert={alerts[0]} remaining={alerts.length - 1} />}
  </>
}
