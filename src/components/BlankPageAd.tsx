import { Adsense } from '@ctrl/react-adsense';
import { useLocation } from 'react-router';
import { useEffect, useState } from 'react';

export default function BlankPageAd() {
  const { pathname } = useLocation();
  const [key, setKey] = useState(0);

  // 当pathname变化时更新key以刷新广告
  useEffect(() => {
    setKey(prevKey => prevKey + 1);
  }, [pathname]);

  return (
    <Adsense
      key={key}
      client={import.meta.env.VITE_PUBLIC_GOOGLE_ADSENSE_CLIENT_ID}
      slot="7853733031"
      style={{ display: 'block' }}
      format="auto"
      adTest={import.meta.env.DEV ? "on" : "off"}
      responsive="true"
    />
  );
}