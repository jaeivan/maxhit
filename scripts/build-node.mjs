// Bundle a TS entry for Node with the engine's '@' alias and asset loaders.
import * as esbuild from 'esbuild';
import path from 'node:path';
const [entry, out] = process.argv.slice(2);
await esbuild.build({
  entryPoints: [entry], outfile: out, bundle: true, platform: 'node', format: 'esm',
  alias: { '@': path.resolve('engine/src') },
  loader: { '.png': 'dataurl', '.webp': 'dataurl', '.svg': 'dataurl' },
  external: ['next/*', 'react', 'react-dom'],
  logLevel: 'warning', nodePaths: [path.resolve('node_modules')], preserveSymlinks: true,
  banner: { js: "import {createRequire} from 'module';const require=createRequire(import.meta.url);" },
});
