import Crawler from '@/components/Crawler';
import UserSelector from '@/components/UserSelector';
import { Ship } from '@/types';

export default function HangarToolbar({ ships }: { ships: Ship[] }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="shrink-0">
        <Crawler ships={ships} />
      </div>
      <div className="min-w-0 flex-1">
        <UserSelector
          variant="embedded"
          align="start"
          minHeight={0}
          preserveSpace
          showActiveUser={false}
        />
      </div>
    </div>
  );
}
