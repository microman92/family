import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// The fixed Docker container name prevents accidental execution against the linked cloud project.
const result = spawnSync(
  'docker',
  [
    'exec',
    '-i',
    'supabase_db_family-space',
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-q',
    '-v',
    'ON_ERROR_STOP=1',
  ],
  {
    input: readFileSync(new URL('./verify-phase-two.sql', import.meta.url)),
    stdio: ['pipe', 'inherit', 'inherit'],
  },
);
if (result.error)
  console.error('Cannot start Docker: ensure Docker Desktop and local Supabase are running.');
process.exit(result.status ?? 1);
