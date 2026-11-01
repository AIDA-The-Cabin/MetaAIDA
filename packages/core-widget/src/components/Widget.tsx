import { MarginTab } from './MarginTab';
import { CabinPanel } from './CabinPanel';
import { PagePill } from './PagePill';
import type { CabinApi } from '../api';

export function Widget({ api }: { api: CabinApi }) {
  return (
    <div class="cabin-ui">
      <MarginTab api={api} />
      <CabinPanel api={api} />
      <PagePill />
    </div>
  );
}
