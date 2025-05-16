import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import './index.css'
import App from './App.tsx'
import { store } from './store'
import { LocaleProvider } from './contexts/LocaleContext'
import { GoogleOAuthProvider } from '@react-oauth/google';

createRoot(document.getElementById('root')!).render(
  <Provider store={store}>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_PUBLIC_GOOGLE_SIGNIN_CLIENT_ID}>
      <LocaleProvider>
        <App />
      </LocaleProvider>
    </GoogleOAuthProvider>
  </Provider>
)
