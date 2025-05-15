import { Adsense } from '@ctrl/react-adsense';

export default function HeaderAd() {
  return (
    <div className="items-center justify-center hidden lg:flex -my-10">
      <Adsense
        client={import.meta.env.VITE_ADSENSE_CLIENT}
        slot="4587258440"
        style={{ width: 500, height: 65 }}
        format=""
      />
    </div>
  );
}