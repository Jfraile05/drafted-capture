import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import base from './manifest.json';

const root = __dirname;
const files = {
  'src/shared/auth': 'src/demo/auth.ts',
  'src/shared/workflowAccess': 'src/demo/workflowAccess.ts',
  'src/shared/submitToDrafted': 'src/demo/submitToDrafted.ts',
  'src/shared/privacyPolicyAccess': 'src/demo/privacyPolicyAccess.ts',
  'src/shared/ownIdentityAccess': 'src/demo/ownIdentityAccess.ts',
  'src/shared/qualityAccess': 'src/demo/qualityAccess.ts',
  'src/popup/Onboarding': 'src/demo/Onboarding.tsx',
  'src/options/Options': 'src/demo/Options.tsx',
  'src/shared/utils/siteAccess': 'src/demo/siteAccess.ts',
};
const replacements = new Map(Object.entries(files).map(([from,to]) => [resolve(root,from),resolve(root,to)]));
const matches = ['http://localhost/*','http://*.localhost/*','http://127.0.0.1/*'];
const manifest = {
  ...base,
  name: 'Sidekick Synthetic Lab',
  description: 'Local synthetic project. Simulated submissions and earnings. Captures local test sites only.',
  host_permissions: matches,
  permissions: [...base.permissions, 'activeTab'],
  background: { ...base.background, service_worker: 'src/demo/background.ts' },
  content_scripts: base.content_scripts.map(script => ({...script,matches})),
  commands: {},
};

export default defineConfig({
  plugins: [{
    name:'synthetic-only-adapters', enforce:'pre',
    resolveId(source,importer) {
      if (!importer || !source.startsWith('.') || importer.startsWith(resolve(root,'src/demo')+'/')) return;
      return replacements.get(resolve(dirname(importer.split('?')[0]),source).replace(/\.tsx?$/,''));
    },
    load(id) {
      if (id === resolve(root,'src/config/local-workflow.json')) {
        return JSON.stringify({...JSON.parse(readFileSync(id,'utf8')),enabled:false});
      }
      if (id === resolve(root,'src/config/url-categories.json')) {
        const catalog=JSON.parse(readFileSync(id,'utf8'));
        for (const [key,host] of Object.entries({flight_booking:'flights.localhost',shopping:'shop.localhost',productivity:'work.localhost',banking:'bank.localhost',email:'mail.localhost'})) catalog[key].rules.push({domains:[host]});
        return JSON.stringify(catalog);
      }
      if (id === resolve(root,'src/config/privacy-policy.json')) {
        const policy=JSON.parse(readFileSync(id,'utf8'));policy.domains.banking.push('bank.localhost');return JSON.stringify(policy);
      }
    },
    transform(code,id) {
      if (id === resolve(root,'src/background/session.ts')) return "import { isDemoUrl } from '../demo/siteAccess';\n" + code.replace('if (tab.id === undefined) return;', "if (tab.id === undefined || !isDemoUrl(tab.url ?? '')) return;");
      if (id === resolve(root,'src/background/privacy.ts')) return "import { isDemoUrl } from '../demo/siteAccess';\n" + code.replace("if (tab.id === undefined || tab.incognito", "if (!isDemoUrl(url) || tab.id === undefined || tab.incognito");
      if (id === resolve(root,'src/background/index.ts')) return code.replace("if (['RECORDING_SAVED', 'RECORDING_FAILED'].includes(message.type)) return;", "if (['RECORDING_SAVED', 'RECORDING_FAILED', 'SYNTHETIC_STORAGE'].includes(message.type)) return;");
      if (id === resolve(root,'src/shared/Brand.tsx')) return code.replace('>By Drafted Labs<','>Synthetic project<');
      if (id === resolve(root,'src/popup/App.tsx')) return code.replace('                Sign out','                Test controls');
      if (id === resolve(root,'src/shared/SyncStatus.tsx')) return code.replace("pending ? 'Uploading' : 'Synced'","pending ? 'Simulating upload' : 'Simulated sync'");
    },
  },react(),crx({manifest})],
  resolve:{alias:{'@':resolve(root,'src')}},
  build:{target:'esnext',outDir:'dist-demo',rollupOptions:{input:{popup:resolve(root,'src/popup/index.html'),panel:resolve(root,'src/panel/index.html'),options:resolve(root,'src/options/index.html'),terms:resolve(root,'src/terms/index.html'),offscreen:resolve(root,'src/offscreen/index.html')}}},
});
