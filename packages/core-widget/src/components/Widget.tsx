import { MarginTab } from './MarginTab';
import { CabinPanel } from './CabinPanel';
import type { CabinApi } from '../api';

export function Widget({ api }: { api: CabinApi }) {
  return (
    <div class="cabin-ui">
      <MarginTab />
      <CabinPanel api={api} />
    </div>
  );
}
