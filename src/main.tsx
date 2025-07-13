import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import '@/index.css'
import App from '@/App'
import { store } from '@/store'
import { LocaleProvider } from '@/contexts/LocaleContext'
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ErrorBoundary } from "react-error-boundary";
import { reportError } from '@/report'

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary fallbackRender={({ error, resetErrorBoundary }) => {
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
