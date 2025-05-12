import { createContext, useState, useContext, ReactNode } from 'react';
import { IntlProvider } from 'react-intl';
import zhCNMessages from '../locales/zh-CN.json';
import enMessages from '../locales/en.json';
import jaJPMessages from '../locales/ja-JP.json';
import deDEMessages from '../locales/de-DE.json';

export type Locale = 'zh-CN' | 'en' | 'ja-JP' | 'de-DE';

const messages: Record<Locale, Record<string, string>> = {
  'en': enMessages,
  'zh-CN': zhCNMessages,
  'ja-JP': jaJPMessages,
  'de-DE': deDEMessages,
};

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  messages: Record<string, string>;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

interface LocaleProviderProps {
  children: ReactNode;
}

export function LocaleProvider({ children }: LocaleProviderProps) {
  const getBrowserLocale = (): Locale => {
    const browserLang = navigator.language;
    if (browserLang.startsWith('zh')) {
      return 'zh-CN';
    }
    if (browserLang.startsWith('ja')) {
      return 'ja-JP';
    }
    if (browserLang.startsWith('de')) {
      return 'de-DE';
    }
    return 'en'; // set default language to en
  };

  let savedLocale = localStorage.getItem('locale') as Locale;
  // Check if the language stored in the browser is supported, if not, reset it
  if (!['zh-CN', 'en', 'ja-JP', 'de-DE'].includes(savedLocale)) {
    savedLocale = getBrowserLocale();
  }
  const [locale, setLocale] = useState<Locale>(savedLocale);

  const handleSetLocale = (newLocale: Locale) => {
    setLocale(newLocale);
    localStorage.setItem('locale', newLocale);
  };

  const value = {
    locale,
    setLocale: handleSetLocale,
    messages: messages[locale],
  };

  return (
    <LocaleContext.Provider value={value}>
      <IntlProvider locale={locale} messages={messages[locale]} defaultLocale="zh-CN">
        {children}
      </IntlProvider>
    </LocaleContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLocale() {
  const context = useContext(LocaleContext);
  if (context === undefined) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
} 