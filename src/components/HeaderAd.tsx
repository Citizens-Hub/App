import { Adsense } from '@ctrl/react-adsense';
import { useLocation } from 'react-router';
import { useEffect, useState } from 'react';

export default function HeaderAd() {
  const { pathname } = useLocation();
  const [key, setKey] = useState(0);
  
  // 当pathname变化时更新key以刷新广告
  useEffect(() => {
    setKey(prevKey => prevKey + 1);
  }, [pathname]);

  return (
    <div className="items-center justify-center hidden lg:flex -my-10">
      <Adsense
        key={key}
        client={import.meta.env.VITE_PUBLIC_GOOGLE_ADSENSE_CLIENT_ID}
        slot="4587258440"
        style={{ width: 500, height: 65 }}
        format=""
        adTest={import.meta.env.DEV ? "on" : "off"}
      />
    </div>
  );
}