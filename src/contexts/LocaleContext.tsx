import { createContext, useEffect, useState, useContext, ReactNode } from 'react';
import { IntlProvider } from 'react-intl';
import zhCNMessages from '../locales/zh-CN.json';
import zhTraditionalMessages from '../locales/zh-HK.json';
import enMessages from '../locales/en.json';
import jaJPMessages from '../locales/ja-JP.json';
import deDEMessages from '../locales/de-DE.json';

export type Locale = 'zh-CN' | 'zh-HK' | 'en' | 'ja-JP' | 'de-DE';
export type EmailLocale = 'zh-CN' | 'zh-HK' | 'en';

const SUPPORTED_LOCALES: Locale[] = ['zh-CN', 'zh-HK', 'en', 'ja-JP', 'de-DE'];
const LOCALE_STORAGE_KEY = 'locale';
const EMAIL_LOCALE_STORAGE_KEY = 'email-locale';
const SHIP_NAME_TRANSLATION_STORAGE_KEY = 'ship-name-translation-enabled';
const DOCUMENT_LANG_BY_LOCALE: Record<Locale, string> = {
  'en': 'en',
  'zh-CN': 'zh-CN',
  'zh-HK': 'zh-HK',
  'ja-JP': 'ja-JP',
  'de-DE': 'de-DE',
};

const messages: Record<Locale, Record<string, string>> = {
  'en': enMessages,
  'zh-CN': zhCNMessages,
  'zh-HK': zhTraditionalMessages,
  'ja-JP': jaJPMessages,
  'de-DE': deDEMessages,
};

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  emailLocale: EmailLocale;
  setEmailLocale: (locale: EmailLocale) => void;
  shipNameTranslationEnabled: boolean;
  setShipNameTranslationEnabled: (enabled: boolean) => void;
  messages: Record<string, string>;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

export function toEmailLocale(locale: Locale): EmailLocale {
  if (locale === 'zh-CN' || locale === 'zh-HK') {
    return locale;
  }

  return 'en';
}

export function getSavedEmailLocale(): EmailLocale {
  const savedEmailLocale = localStorage.getItem(EMAIL_LOCALE_STORAGE_KEY);
  if (savedEmailLocale === 'zh-CN' || savedEmailLocale === 'zh-HK' || savedEmailLocale === 'en') {
    return savedEmailLocale;
  }

  return 'en';
}

export function hasSavedEmailLocalePreference(): boolean {
  const savedEmailLocale = localStorage.getItem(EMAIL_LOCALE_STORAGE_KEY);
  return savedEmailLocale === 'zh-CN' || savedEmailLocale === 'zh-HK' || savedEmailLocale === 'en';
}

export function persistEmailLocale(locale: EmailLocale) {
  localStorage.setItem(EMAIL_LOCALE_STORAGE_KEY, locale);
}

function getInitialEmailLocale(locale: Locale): EmailLocale {
  return hasSavedEmailLocalePreference() ? getSavedEmailLocale() : toEmailLocale(locale);
}

interface LocaleProviderProps {
  children: ReactNode;
}

export function LocaleProvider({ children }: LocaleProviderProps) {
  const getBrowserLocale = (): Locale => {
    const browserLang = navigator.language;
    const isTraditionalChinese = browserLang.startsWith('zh-TW')
      || browserLang.startsWith('zh-HK')
      || browserLang.startsWith('zh-MO')
      || browserLang.includes('Hant');

    if (isTraditionalChinese) {
      return 'zh-HK';
    }
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

  const getSavedLocale = (): Locale => {
    const savedLocale = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
    if (savedLocale && SUPPORTED_LOCALES.includes(savedLocale)) {
      return savedLocale;
    }
    return getBrowserLocale();
  };

  const getSavedShipNameTranslationEnabled = (): boolean => {
    const savedValue = localStorage.getItem(SHIP_NAME_TRANSLATION_STORAGE_KEY);
    if (savedValue === null) {
      return true;
    }
    return savedValue === 'true';
  };

  const [locale, setLocale] = useState<Locale>(getSavedLocale);
  const [emailLocale, setEmailLocale] = useState<EmailLocale>(() => getInitialEmailLocale(locale));
  const [shipNameTranslationEnabled, setShipNameTranslationEnabled] = useState<boolean>(getSavedShipNameTranslationEnabled);

  useEffect(() => {
    document.documentElement.lang = DOCUMENT_LANG_BY_LOCALE[locale];
  }, [locale]);

  const handleSetLocale = (newLocale: Locale) => {
    setLocale(newLocale);
    localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
    const nextEmailLocale = toEmailLocale(newLocale);
    setEmailLocale(nextEmailLocale);
    persistEmailLocale(nextEmailLocale);
  };

  const handleSetEmailLocale = (newLocale: EmailLocale) => {
    setEmailLocale(newLocale);
    persistEmailLocale(newLocale);
  };

  const handleSetShipNameTranslationEnabled = (enabled: boolean) => {
    setShipNameTranslationEnabled(enabled);
    localStorage.setItem(SHIP_NAME_TRANSLATION_STORAGE_KEY, String(enabled));
  };

  const value = {
    locale,
    setLocale: handleSetLocale,
    emailLocale,
    setEmailLocale: handleSetEmailLocale,
    shipNameTranslationEnabled,
    setShipNameTranslationEnabled: handleSetShipNameTranslationEnabled,
    messages: messages[locale],
  };

  return (
    <LocaleContext.Provider value={value}>
      <IntlProvider locale={locale} messages={messages[locale]} defaultLocale="zh-CN" textComponent="span">
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
