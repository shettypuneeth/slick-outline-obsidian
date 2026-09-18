import esbuild from 'esbuild';
import { builtinModules } from 'node:module';

const production = process.argv.includes('production');
const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian', 'electron',
    '@codemirror/state', '@codemirror/view', '@codemirror/language',
    '@lezer/common', '@lezer/highlight',
    ...builtinModules,
  ],
  format: 'cjs',
  target: 'es2021',
  outfile: 'main.js',
  sourcemap: production ? false : 'inline',
  minify: production,
  logLevel: 'info',
  banner: { js: '/* Generated file. Source: src/main.ts */' },
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
