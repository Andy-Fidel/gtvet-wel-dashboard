import { useEffect, useRef, useState } from 'react'
import { Download, RefreshCw, Share2, WifiOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const INSTALL_DISMISSED_AT = 'gtvets-pwa-install-dismissed-at'
const INSTALL_REMINDER_DELAY = 14 * 24 * 60 * 60 * 1000

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches
  || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

export function PwaManager() {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)
  const [installed, setInstalled] = useState(isStandalone)
  const [installDismissed, setInstallDismissed] = useState(() => {
    const dismissedAt = Number(localStorage.getItem(INSTALL_DISMISSED_AT) || 0)
    return Date.now() - dismissedAt < INSTALL_REMINDER_DELAY
  })
  const refreshing = useRef(false)

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    const handleInstalled = () => {
      setInstalled(true)
      setInstallPrompt(null)
      localStorage.removeItem(INSTALL_DISMISSED_AT)
    }
    const handleControllerChange = () => {
      if (refreshing.current) return
      refreshing.current = true
      window.location.reload()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)

    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
      let disposed = false
      let interval: number | undefined
      let registrationRef: ServiceWorkerRegistration | undefined
      let handleUpdateFound: (() => void) | undefined
      const checkForUpdate = () => {
        if (document.visibilityState === 'visible') void registrationRef?.update()
      }
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(registration => {
        if (disposed) return
        registrationRef = registration
        if (registration.waiting && navigator.serviceWorker.controller) setWaitingWorker(registration.waiting)
        handleUpdateFound = () => {
          const worker = registration.installing
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaitingWorker(worker)
          })
        }
        registration.addEventListener('updatefound', handleUpdateFound)
        interval = window.setInterval(() => { void registration.update() }, 60 * 60 * 1000)
      }).catch(error => console.error('Service worker registration failed:', error))
      document.addEventListener('visibilitychange', checkForUpdate)

      return () => {
        disposed = true
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
        window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
        window.removeEventListener('appinstalled', handleInstalled)
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
        document.removeEventListener('visibilitychange', checkForUpdate)
        if (registrationRef && handleUpdateFound) registrationRef.removeEventListener('updatefound', handleUpdateFound)
        if (interval) window.clearInterval(interval)
      }
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const dismissInstall = () => {
    localStorage.setItem(INSTALL_DISMISSED_AT, String(Date.now()))
    setInstallDismissed(true)
  }

  const install = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'dismissed') dismissInstall()
    setInstallPrompt(null)
  }

  const applyUpdate = () => waitingWorker?.postMessage({ type: 'SKIP_WAITING' })
  const showIosHelp = !installed && isIos() && !installDismissed
  const showInstall = !installed && !installDismissed && Boolean(installPrompt)

  return <>
    {!online ? <div role="status" className="fixed inset-x-0 top-0 z-[120] flex min-h-10 items-center justify-center gap-2 bg-slate-950 px-4 py-2 text-center text-sm font-semibold text-white shadow-lg">
      <WifiOff className="h-4 w-4 shrink-0 text-amber-400" /> Offline mode: saved actions will sync when your connection returns.
    </div> : null}

    {waitingWorker ? <div role="status" className="fixed bottom-4 left-1/2 z-[120] flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 items-center gap-3 rounded-2xl border border-amber-200 bg-white p-4 shadow-2xl">
      <RefreshCw className="h-5 w-5 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1"><p className="font-black text-slate-900">App update ready</p><p className="text-sm text-slate-600">Reload to use the latest GTVETS WEL version.</p></div>
      <Button size="sm" onClick={applyUpdate}>Update</Button>
    </div> : null}

    {!waitingWorker && (showInstall || showIosHelp) ? <div role="status" className="fixed bottom-4 left-1/2 z-[110] flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 items-start gap-3 rounded-2xl border border-amber-200 bg-white p-4 shadow-2xl">
      {showIosHelp ? <Share2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /> : <Download className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />}
      <div className="min-w-0 flex-1"><p className="font-black text-slate-900">Install GTVETS WEL</p><p className="text-sm text-slate-600">{showIosHelp ? 'In Safari, tap Share and then Add to Home Screen.' : 'Add the portal to this device for faster access and a reliable offline shell.'}</p></div>
      {showInstall ? <Button size="sm" onClick={() => void install()}>Install</Button> : null}
      <button type="button" aria-label="Dismiss install reminder" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={dismissInstall}><X className="h-4 w-4" /></button>
    </div> : null}
  </>
}
