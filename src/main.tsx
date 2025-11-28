import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import '@/index.css'
import App from '@/App'
import { store } from '@/store'
import { LocaleProvider } from '@/contexts/LocaleContext'
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ErrorBoundary } from "react-error-boundary";
import { BiSlots, reportBi, reportError } from '@/report'
import { ErrorInfo } from 'react'
import { RawSourceMap, SourceMapConsumer } from "source-map-js";

// Check if error is a dynamic import module failure
const isDynamicImportError = (error: Error | unknown): boolean => {
  const errorMessage = String(error);
  return errorMessage.includes('Failed to fetch dynamically imported module');
}

// Handle dynamic import errors by reloading the page
const handleDynamicImportError = () => {
  console.log('Dynamic import module failed, version updated. Reloading page...');
  window.location.reload();
}

// Global error handler for unhandled promise rejections (dynamic imports can throw these)
window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason;
  if (error && isDynamicImportError(error)) {
    event.preventDefault();
    handleDynamicImportError();
  }
});

// Global error handler for window errors
window.addEventListener('error', (event) => {
  if (event.error && isDynamicImportError(event.error)) {
    event.preventDefault();
    handleDynamicImportError();
  }
});

const sourcemapCache: Record<string, unknown> = {};

async function fetchSourceMap(file: string): Promise<unknown> {
  const mapUrl = `/assets/${file}.map`; // 直接拼接 .map
  if (sourcemapCache[mapUrl]) return sourcemapCache[mapUrl];

  try {
    const res = await fetch(mapUrl);
    if (!res.ok) return null;
    const map = await res.json();
    sourcemapCache[mapUrl] = map;
    return map;
  } catch {
    return null;
  }
}

export const parseCallStack = async (callStack: string) => {
  async function mapLine(line: string): Promise<string> {
    // 匹配文件名:行:列
    const m = line.match(/(?:http[s]?:\/\/[^ ]+\/)?([^/\s]+\.js):(\d+):(\d+)/);
    if (!m) return line;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_, file, lineStr, colStr] = m;
    const ln = +lineStr;
    const col = +colStr;

    const map = await fetchSourceMap(file);
    if (!map) return line;

    const consumer = await new SourceMapConsumer(map as RawSourceMap);
    const orig = consumer.originalPositionFor({ line: ln, column: col });

    console.log(orig)

    if (!orig.source) return line;

    return `at ${orig.name}(${orig.source}:${orig.line}:${orig.column})`
  }

  const lines = callStack.split("\n");
  const mappedLines = await Promise.all(lines.map(mapLine));
  return mappedLines.join("\n");
};

const logError = async (error: Error, info: ErrorInfo) => {
  // Do something with the error, e.g. log to an external API
  if (isDynamicImportError(error)) return;

  // const parsedCallstack = await parseCallStack(info.componentStack || "")

  // console.log("parsedCallstack>>>>>>>>>>>", parsedCallstack)

  reportError({
    errorType: 'Render Error',
    errorMessage: String(error),
    appVersion: __BUILD_TIME__,
    callStack: info.componentStack || undefined
  })
};

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary
    onError={logError}
    fallbackRender={({ error, resetErrorBoundary }) => {
      // Check if this is a dynamic import error
      if (isDynamicImportError(error)) {
        // Auto reload for dynamic import errors immediately
        reportBi<null>({
          slot: BiSlots.VERSION_UPDATE,
          data: null
        })
        handleDynamicImportError();
        // Return minimal UI while reloading
        return (
          <div className="flex flex-col gap-4 p-4 items-center justify-center h-screen">
            <h1 className="text-xl font-bold">Version Updated</h1>
            <p className="text-gray-600">Reloading page...</p>
          </div>
        );
      }

      // // For other errors, show the normal error UI
      // reportError({
      //   errorType: 'Render Error',
      //   errorMessage: String(error)
      // })
      return <>
        <div className="flex flex-col gap-4 p-4">
          <h1>Something went wrong</h1>
          <p>{String(error)}</p>
          <button onClick={() => {
            resetErrorBoundary()
          }}>Reload</button>
          <button onClick={() => {
            window.localStorage.clear()
            window.location.reload()
          }}>Clear Storage and Reload</button>
          <button onClick={() => window.location.href = "https://github.com/Citizens-Hub/App/issues"}>Report Issue</button>
          <button onClick={() => window.location.href = "https://discord.com/invite/AEuRtb5Vy8"}>Discord Support Channel</button>
        </div>
      </>
    }}>
    <Provider store={store}>
      <GoogleOAuthProvider clientId={import.meta.env.VITE_PUBLIC_GOOGLE_SIGNIN_CLIENT_ID}>
        <LocaleProvider>
          <App />
        </LocaleProvider>
      </GoogleOAuthProvider>
    </Provider>
  </ErrorBoundary>
)
