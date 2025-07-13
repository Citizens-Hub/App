import useSWR from 'swr';
import { useState, useEffect } from 'react';
import { fetcher } from './swr-config';

/**
 * 获取Markdown文档内容的通用钩子
 * 
 * @param chinesePath 中文文档路径
 * @param englishPath 英文文档路径
 * @returns 文档内容、加载状态和错误信息
 */
export default function useDocumentData(chinesePath: string, englishPath: string) {
  const [content, setContent] = useState<string>('');
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');

  // 获取中文文档
  const { 
    data: chineseData,
    error: chineseError,
    isLoading: chineseLoading 
  } = useSWR<string>(chinesePath, fetcher);

  // 获取英文文档
  const { 
    data: englishData,
    error: englishError,
    isLoading: englishLoading 
  } = useSWR<string>(englishPath, fetcher);

  // 根据用户选择或浏览器语言显示相应文档
  useEffect(() => {
    // 尝试从localStorage中获取语言偏好
    const storedLanguage = localStorage.getItem('preferredLanguage');
    
    // 如果没有存储的语言偏好，则从浏览器语言中获取
    if (!storedLanguage) {
      const browserLanguage = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
      setLanguage(browserLanguage);
      localStorage.setItem('preferredLanguage', browserLanguage);
    } else {
      setLanguage(storedLanguage as 'zh' | 'en');
    }
  }, []);

  // 根据当前语言选择内容
  useEffect(() => {
    if (language === 'zh' && chineseData) {
      setContent(chineseData);
    } else if (language === 'en' && englishData) {
      setContent(englishData);
    }
  }, [chineseData, englishData, language]);

  // 切换语言
  const toggleLanguage = () => {
    const newLanguage = language === 'zh' ? 'en' : 'zh';
    setLanguage(newLanguage);
    localStorage.setItem('preferredLanguage', newLanguage);
  };

  // 处理加载状态和错误
  const isLoading = (language === 'zh' && chineseLoading) || (language === 'en' && englishLoading);
  const error = language === 'zh' ? chineseError : englishError;

  return { 
    content,
    language,
    toggleLanguage,
    isLoading, 
    error 
  };
} 