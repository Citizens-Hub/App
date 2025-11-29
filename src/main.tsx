import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import '@/index.css'
import App from '@/App'
import { store } from '@/store'
import { LocaleProvider } from '@/contexts/LocaleContext'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { ErrorBoundary } from "react-error-boundary"
import { BiSlots, reportBi, reportError } from '@/report'
import { RawSourceMap, SourceMapConsumer } from "source-map-js"

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

const sourcemapCache: Record<string, RawSourceMap> = {}

async function fetchSourceMap(file: string): Promise<RawSourceMap | null> {
  const mapUrl = `/assets/${file}.map`
  if (sourcemapCache[mapUrl]) return sourcemapCache[mapUrl]

  try {
    const res = await fetch(mapUrl)
    if (!res.ok) return null
    const json = await res.json()
    sourcemapCache[mapUrl] = json
    return json
  } catch {
    return null
  }
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

      const consumer = await new SourceMapConsumer(map)
      const orig = consumer.originalPositionFor({ line: ln, column: col })

      if (!orig.source || orig.source.includes('node_modules')) return line

      return `    at ${orig.name || '(anonymous)'} (${orig.source}:${orig.line}:${orig.column})`
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

const logError = async (error: Error) => {
  if (isDynamicImportError(error)) return

  const jsStack = error.stack
    ? await parseJsStack(error.stack)
    : null

  reportError({
    errorType: 'Render Error',
    errorMessage: String(error),
    appVersion: __BUILD_TIME__,
    callStack: jsStack || ""
  })
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary
    onError={logError}
    fallbackRender={({ error, resetErrorBoundary }) => {
      if (isDynamicImportError(error)) {
        reportBi({
          slot: BiSlots.VERSION_UPDATE,
          data: null
        })
        handleDynamicImportError()
        return (
          <div className="flex flex-col gap-4 p-4 items-center justify-center h-screen">
            <h1 className="text-xl font-bold">Version Updated</h1>
            <p className="text-gray-600">Reloading page...</p>
          </div>
        )
      }

      return (
        <div className="flex flex-col gap-4 p-4">
          <h1>Something went wrong</h1>
          <p>{String(error)}</p>
          <button onClick={resetErrorBoundary}>Reload</button>
          <button onClick={() => {
            window.localStorage.clear()
            window.location.reload()
          }}>Clear Storage & Reload</button>
          <button onClick={() => window.location.href = "https://github.com/Citizens-Hub/App/issues"}>Report Issue</button>
          <button onClick={() => window.location.href = "https://discord.com/invite/AEuRtb5Vy8"}>Discord Support</button>
        </div>
      )
    }}
  >
    <Provider store={store}>
      <GoogleOAuthProvider clientId={import.meta.env.VITE_PUBLIC_GOOGLE_SIGNIN_CLIENT_ID}>
        <LocaleProvider>
          <App />
        </LocaleProvider>
      </GoogleOAuthProvider>
    </Provider>
  </ErrorBoundary>
)
