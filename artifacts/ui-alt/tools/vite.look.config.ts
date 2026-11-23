// The app's dev server for taking pictures while several hands edit the sources: the same config, but a
// page already open is never reloaded under the camera (no hot reload); each new page gets the sources
// as they are then.
//   cd apps/web && npx vite --config ../../artifacts/ui-alt/tools/vite.look.config.ts --port 4317 --strictPort
import { mergeConfig, type UserConfig } from 'vite';
import base from '../../../apps/web/vite.config.ts';

export default mergeConfig(base as UserConfig, { server: { hmr: false } });
