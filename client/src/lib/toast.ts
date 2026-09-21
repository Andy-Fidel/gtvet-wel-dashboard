import { toast as sonner } from 'sonner'
import { dismissAlert, showAlert } from './alerts'
import type { AlertMessage } from './alerts'
import type { ExternalToast } from 'sonner'

// One entry point keeps every page, including public routes, on the same alert workflow.
export const toast = Object.assign(
  (message: AlertMessage, options?: ExternalToast) => sonner(message, options),
  sonner,
  {
    error: (message: AlertMessage, options?: ExternalToast) => showAlert('error', message, options),
    success: (message: AlertMessage, options?: ExternalToast) => showAlert('success', message, options),
    warning: (message: AlertMessage, options?: ExternalToast) => showAlert('warning', message, options),
    dismiss: (id?: string | number) => { dismissAlert(id); return sonner.dismiss(id) },
  },
)
