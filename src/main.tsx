import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import '@/index.css'
import App from '@/App'
import { store } from '@/store'
import { LocaleProvider } from '@/contexts/LocaleContext'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { ErrorBoundary, type FallbackProps } from "react-error-boundary"
import { BiSlots, reportBi, reportError } from '@/report'
import { RawSourceMap, SourceMapConsumer } from "source-map-js"
import { useIntl } from 'react-intl'
import { registerModelCacheServiceWorker } from '@/utils/modelCache'

registerModelCacheServiceWorker()

const isDynamicImportError = (error: Error | unknown): boolean => {
  return String(error).includes('Failed to fetch dynamically imported module');
}

const handleDynamicImportError = () => {
  console.log('[Error] Dynamic import failed → Reloading page.')
  window.location.reload()
}

window.addEventListener('unhandledrejection', (event) => {
  if (isDynamicImportError(event.reason)) {
    event.preventDefault()
    handleDynamicImportError()
  }
})

window.addEventListener('error', (event) => {
  if (isDynamicImportError(event.error)) {
    event.preventDefault()
    handleDynamicImportError()
  }
})

const sourcemapCache: Record<string, Promise<RawSourceMap | null> | null> = {}

async function fetchSourceMap(file: string): Promise<RawSourceMap | null> {
  const mapUrl = `/assets/${file}.map`

  if (sourcemapCache[mapUrl]) return sourcemapCache[mapUrl]

  const p = (async () => {
    try {
      const res = await fetch(mapUrl, { cache: "force-cache" })
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  })()

  sourcemapCache[mapUrl] = p
  return p
}

const STACK_LINE_RE =
  /https?:\/\/[^\s]+\/assets\/([^/\s]+\.js):(\d+):(\d+)/

export async function parseJsStack(stack: string): Promise<string> {
  const lines = stack.split('\n')

  const mappedLines = await Promise.all(
    lines.map(async (line) => {
      const m = line.match(STACK_LINE_RE)
      if (!m) return line

      const [, file, lineStr, colStr] = m
      const ln = Number(lineStr)
      const col = Number(colStr)

      const map = await fetchSourceMap(file)
      if (!map) return line

      const consumer = new SourceMapConsumer(map)
      const orig = consumer.originalPositionFor({ line: ln, column: col })

      if (!orig.source) return line

      return `    at ${orig.name || 'anonymous'} (${orig.source}:${orig.line}:${orig.column})`
    })
  )

  return mappedLines.join('\n')
}

export function parseComponentStack(componentStack: string): string[] {
  return componentStack
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

const logError = (error: unknown) => {
  if (!(error instanceof Error) || isDynamicImportError(error)) return

  void (async () => {
    const jsStack = error.stack
      ? await parseJsStack(error.stack)
      : null

    reportError({
      errorType: 'Render Error',
      errorMessage: String(error),
      appVersion: __BUILD_TIME__,
      callStack: jsStack || ""
    })
  })()
}

function AppErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
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

createRoot(document.getElementById('root')!).render(
  <Provider store={store}>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_PUBLIC_GOOGLE_SIGNIN_CLIENT_ID}>
      <LocaleProvider>
        <ErrorBoundary
          onError={logError}
          FallbackComponent={AppErrorFallback}
        >
          <App />
        </ErrorBoundary>
      </LocaleProvider>
    </GoogleOAuthProvider>
  </Provider>
)
