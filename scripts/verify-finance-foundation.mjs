import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Use --installed after applying the migration. Fixtures always roll back.
const migration = process.argv.includes('--installed')
  ? Buffer.alloc(0)
  : readFileSync(
      new URL(
        '../supabase/migrations/20261103072538_finance_ledger_foundation.sql',
        import.meta.url,
      ),
    );
const tests = readFileSync(new URL('./verify-finance-foundation.sql', import.meta.url));
const expenseMigration = process.argv.includes('--installed')
  ? Buffer.alloc(0)
  : readFileSync(
      new URL('../supabase/migrations/20261103093135_finance_expense_posting.sql', import.meta.url),
    );
const expenseTests = readFileSync(new URL('./verify-finance-expense.sql', import.meta.url));
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
    input: Buffer.concat([
      Buffer.from('begin;\n'),
      migration,
      Buffer.from('\n'),
      expenseMigration,
      Buffer.from('\n'),
      tests,
      Buffer.from('\n'),
      expenseTests,
      Buffer.from('\nrollback;\n'),
    ]),
    stdio: ['pipe', 'inherit', 'inherit'],
  },
);
if (result.error)
  console.error('Cannot start Docker: ensure Docker Desktop and local Supabase are running.');
process.exit(result.status ?? 1);
