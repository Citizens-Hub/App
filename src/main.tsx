import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import '@/index.css'
import App from '@/App'
import { store } from '@/store'
import { LocaleProvider } from '@/contexts/LocaleContext'
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ErrorBoundary } from "react-error-boundary";
import { reportError } from '@/report'

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

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary fallbackRender={({ error, resetErrorBoundary }) => {
    // Check if this is a dynamic import error
    if (isDynamicImportError(error)) {
      // Auto reload for dynamic import errors immediately
      handleDynamicImportError();
      // Return minimal UI while reloading
      return (
        <div className="flex flex-col gap-4 p-4 items-center justify-center h-screen">
          <h1 className="text-xl font-bold">Version Updated</h1>
          <p className="text-gray-600">Reloading page...</p>
        </div>
      );
    }

    // For other errors, show the normal error UI
    reportError({
      errorType: 'Render Error',
      errorMessage: String(error)
    })
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
