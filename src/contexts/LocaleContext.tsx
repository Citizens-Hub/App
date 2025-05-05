import { createContext, useState, useContext, ReactNode } from 'react';
import { IntlProvider } from 'react-intl';
import zhCNMessages from '../locales/zh-CN.json';
import enUSMessages from '../locales/en-US.json';

// 支持的语言
export type Locale = 'zh-CN' | 'en-US';

// 语言消息映射
const messages: Record<Locale, Record<string, string>> = {
  'zh-CN': zhCNMessages,
  'en-US': enUSMessages,
};

// 语言上下文接口
interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  messages: Record<string, string>;
}

// 创建语言上下文
const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

// 语言Provider属性
interface LocaleProviderProps {
  children: ReactNode;
}

// 语言Provider组件
export function LocaleProvider({ children }: LocaleProviderProps) {
  // 获取浏览器语言
  const getBrowserLocale = (): Locale => {
    const browserLang = navigator.language;
    // 检查浏览器语言是否为支持的语言之一
    if (browserLang.startsWith('zh')) {
      return 'zh-CN';
    }
    return 'en-US'; // 默认返回英文
  };

  // 优先使用localStorage中保存的语言，其次使用浏览器语言
  const savedLocale = localStorage.getItem('locale') as Locale;
  const [locale, setLocale] = useState<Locale>(savedLocale || getBrowserLocale());

  // 设置语言并保存到localStorage
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

// 自定义Hook用于获取和设置语言
export function useLocale() {
  const context = useContext(LocaleContext);
  if (context === undefined) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
} 