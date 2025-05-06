import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import './index.css'
import App from './App.tsx'
import { store } from './store'
import { LocaleProvider } from './contexts/LocaleContext'

const adSenseScript = document.createElement('script')
adSenseScript.crossOrigin = 'anonymous'
adSenseScript.async = true
adSenseScript.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${import.meta.env.VITE_PUBLIC_GOOGLE_ADSENSE_CLIENT_ID}`
document.head.appendChild(adSenseScript)


createRoot(document.getElementById('root')!).render(
  <Provider store={store}>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </Provider>
)
