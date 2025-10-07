import { Adsense } from '@ctrl/react-adsense';

export default function ShipBlockAd() {
  return (
    <Adsense
      client={import.meta.env.VITE_PUBLIC_GOOGLE_ADSENSE_CLIENT_ID}
      slot="9470009919"
      format="fluid"
      layoutKey="-hb-4+10-6a+bh"
    />
  );
}