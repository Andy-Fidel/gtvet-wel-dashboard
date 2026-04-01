import { useEffect, useCallback } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Guards against accidental navigation when a form has unsaved changes.
 * Shows a browser-native confirmation dialog on:
 * - Tab/window close (beforeunload)
 * - In-app navigation (react-router blocker)
 *
 * @param isDirty - typically `form.formState.isDirty` from react-hook-form
 */
export function useFormGuard(isDirty: boolean) {
  // Guard against tab close / browser navigation
  const handleBeforeUnload = useCallback(
    (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    },
    [isDirty]
  );

  useEffect(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [handleBeforeUnload]);

  // Guard against in-app navigation via react-router
  useBlocker(
    useCallback(
      () => {
        if (isDirty) {
          return !window.confirm(
            'You have unsaved changes. Are you sure you want to leave?'
          );
        }
        return false;
      },
      [isDirty]
    )
  );
}
