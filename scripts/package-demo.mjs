import { cpSync, mkdirSync, readFileSync, readdirSync, chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';

const destination = process.argv[2];
if (!destination || !isAbsolute(destination)) throw new Error('Pass a new absolute destination folder.');
const root = resolve('dist-demo');
const manifest = JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));
if (manifest.name !== 'Sidekick Synthetic Lab') throw new Error('Run npm run build:demo first.');
mkdirSync(destination);
cpSync(root,join(destination,'extension'),{recursive:true});
mkdirSync(join(destination,'workspace'));
for (const name of ['server.mjs','style.css']) cpSync(join('demo',name),join(destination,'workspace',name));
cpSync('src/demo/settings.json',join(destination,'workspace','settings.json'));
for (const name of ['README.md','Start workspace.command']) cpSync(join('demo',name),join(destination,name));
chmodSync(join(destination,'Start workspace.command'),0o755);
function files(dir,relative='') { return readdirSync(join(dir,relative),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(dir,join(relative,entry.name)):[join(relative,entry.name)]).sort(); }
const expected=files(root), actual=files(join(destination,'extension'));
if(JSON.stringify(expected)!==JSON.stringify(actual))throw new Error('Package file list mismatch');
for(const file of expected) {
  const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
  if(hash(join(root,file))!==hash(join(destination,'extension',file)))throw new Error(`Package mismatch: ${file}`);
}
console.log(JSON.stringify({folder:destination,extension:join(destination,'extension'),version:manifest.version,verifiedFiles:expected.length},null,2));
