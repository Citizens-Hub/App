import { Adsense } from '@ctrl/react-adsense';

export default function HeaderAd() {
  return (
    <Adsense
      client={import.meta.env.VITE_ADSENSE_CLIENT}
      slot="9470009919"
      format="fluid"
      layoutKey="-hb-4+10-6a+bh"
    />
  );
}