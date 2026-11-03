import { sameScope, type Scope } from '../../access/domain/scope';

export type AccountKind = 'asset' | 'liability' | 'equity' | 'income' | 'expense';
export type LedgerAccount = { id: string; scope: Scope; kind: AccountKind; currency: 'UZS' };
export type Posting = { account: LedgerAccount; amount: bigint };

const MIN_AMOUNT = -9223372036854775808n;
const MAX_AMOUNT = 9223372036854775807n;

/** Verify a candidate journal before attempting an atomic database operation. */
export function assertBalancedPostings(postings: readonly Posting[]): void {
  if (postings.length < 2) throw new Error('At least two postings are required');
  const first = postings[0]!;
  let sum = 0n;
  for (const posting of postings) {
    if (!posting.account.id || posting.account.currency !== 'UZS')
      throw new Error('Invalid account');
    if (!sameScope(first.account.scope, posting.account.scope))
      throw new Error('Mixed account scopes');
    if (posting.amount === 0n || posting.amount < MIN_AMOUNT || posting.amount > MAX_AMOUNT)
      throw new Error('Invalid posting amount');
    sum += posting.amount;
  }
  if (new Set(postings.map((posting) => posting.account.id)).size < 2)
    throw new Error('At least two distinct accounts are required');
  if (sum !== 0n) throw new Error('Postings must balance');
}

export function createExpensePostings(
  amount: bigint,
  cash: LedgerAccount,
  expense: LedgerAccount,
): readonly Posting[] {
  if (amount <= 0n || amount > MAX_AMOUNT || cash.kind !== 'asset' || expense.kind !== 'expense')
    throw new Error('Invalid expense accounts or amount');
  const postings = [
    { account: expense, amount },
    { account: cash, amount: -amount },
  ];
  assertBalancedPostings(postings);
  return postings;
}
