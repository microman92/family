import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const next = 'node_modules/next/dist/bin/next';
const env = {
  ...process.env,
  FAMILY_E2E_BUILD: '1',
  NEXT_PUBLIC_SUPABASE_URL: '',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
};
const files = ['next-env.d.ts', 'tsconfig.json'].map((path) => [path, readFileSync(path)]);
const build = spawnSync(process.execPath, [next, 'build'], { stdio: 'inherit', env });
for (const [path, content] of files) writeFileSync(path, content);
if (build.status !== 0) process.exit(build.status ?? 1);
const tests = spawnSync(
  process.execPath,
  ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)],
  { stdio: 'inherit', env },
);
process.exit(tests.status ?? 1);
