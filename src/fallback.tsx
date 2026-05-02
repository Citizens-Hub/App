import { type FallbackProps } from "react-error-boundary"
import { BiSlots, reportBi } from '@/report'
import { useIntl } from 'react-intl'

const isDynamicImportError = (error: Error | unknown): boolean => {
  return String(error).includes('Failed to fetch dynamically imported module') ||
    String(error).includes('Importing a module script failed');
}

const handleDynamicImportError = () => {
  console.log('[Error] Dynamic import failed → Reloading page.')
  window.location.reload()
}

export default function AppErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const intl = useIntl()

  if (isDynamicImportError(error)) {
    reportBi({
      slot: BiSlots.VERSION_UPDATE,
      data: null
    })

    handleDynamicImportError()

    return (
      <div className="flex flex-col gap-4 p-4 items-center justify-center h-screen">
        <h1 className="text-xl font-bold">
          {intl.formatMessage({
            id: 'errorBoundary.versionUpdated',
            defaultMessage: 'Version Updated',
          })}
        </h1>
        <p className="text-gray-600">
          {intl.formatMessage({
            id: 'errorBoundary.reloading',
            defaultMessage: 'Reloading page...',
          })}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1>
        {intl.formatMessage({
          id: 'errorBoundary.title',
          defaultMessage: 'Something went wrong',
        })}
      </h1>
      <p>{String(error)}</p>
      <button onClick={resetErrorBoundary}>
        {intl.formatMessage({
          id: 'errorBoundary.reload',
          defaultMessage: 'Reload',
        })}
      </button>
      <button onClick={() => {
        window.localStorage.clear()
        window.location.reload()
      }}
      >
        {intl.formatMessage({
          id: 'errorBoundary.clearStorageReload',
          defaultMessage: 'Clear Storage & Reload',
        })}
      </button>
      <button onClick={() => window.location.href = "https://github.com/Citizens-Hub/App/issues"}>
        {intl.formatMessage({
          id: 'errorBoundary.reportIssue',
          defaultMessage: 'Report Issue',
        })}
      </button>
      <button onClick={() => window.location.href = "https://discord.com/invite/AEuRtb5Vy8"}>
        {intl.formatMessage({
          id: 'errorBoundary.discordSupport',
          defaultMessage: 'Discord Support',
        })}
      </button>
    </div>
  )
}