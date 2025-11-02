import { Adsense } from '@ctrl/react-adsense';

export default function BlankPageAd() {

  return (
    <div className="w-full max-h-[400px]">
      <Adsense
        client={import.meta.env.VITE_PUBLIC_GOOGLE_ADSENSE_CLIENT_ID}
        slot="7853733031"
        style={{ display: 'inline-block', width: '100%', height: '450px', maxWidth: '728px' }}
        format=""
        adTest={import.meta.env.DEV ? "on" : "off"}
      />
    </div>
  );
}