import { describe, expect, it } from 'vitest';
import { parseMoneyUZS, formatMoneyUZS } from '@/server/modules/finance/domain/money';
import {
  assertBalancedPostings,
  createExpensePostings,
  type LedgerAccount,
} from '@/server/modules/finance/domain/ledger';

const cash: LedgerAccount = {
  id: 'cash',
  kind: 'asset',
  currency: 'UZS',
  scope: { visibility: 'family', familyId: 'a' },
};
const expense: LedgerAccount = {
  id: 'expense',
  kind: 'expense',
  currency: 'UZS',
  scope: { visibility: 'family', familyId: 'a' },
};

describe('Денежные суммы UZS', () => {
  it('сохраняет точность bigint и ограничение PostgreSQL', () => {
    expect(formatMoneyUZS(parseMoneyUZS('9223372036854775807'))).toBe('9223372036854775807');
    for (const value of ['0', '-1', '1.5', '01', '9223372036854775808', '1e3', ' 12'])
      expect(() => parseMoneyUZS(value)).toThrow();
  });
});

describe('Финансовый журнал', () => {
  it('создаёт сбалансированный расход без потери точности', () => {
    const postings = createExpensePostings(30000n, cash, expense);
    expect(postings.map((item) => item.amount)).toEqual([30000n, -30000n]);
    expect(() => assertBalancedPostings(postings)).not.toThrow();
  });
  it('отклоняет несбалансированные проводки, неверные счета и суммы', () => {
    expect(() =>
      assertBalancedPostings([
        { account: cash, amount: -10n },
        { account: expense, amount: 9n },
      ]),
    ).toThrow();
    expect(() =>
      assertBalancedPostings([
        { account: cash, amount: -10n },
        { account: cash, amount: 10n },
      ]),
    ).toThrow();
    expect(() => createExpensePostings(0n, cash, expense)).toThrow();
    expect(() => createExpensePostings(10n, expense, cash)).toThrow();
    expect(() =>
      assertBalancedPostings([
        { account: cash, amount: 0n },
        { account: expense, amount: 0n },
      ]),
    ).toThrow();
  });
  it('не смешивает семьи и личные пространства', () => {
    const foreign = { ...expense, scope: { visibility: 'family', familyId: 'b' } } as LedgerAccount;
    const privateAccount = {
      ...expense,
      scope: { visibility: 'private', ownerUserId: 'a' },
    } as LedgerAccount;
    expect(() => createExpensePostings(10n, cash, foreign)).toThrow('Mixed account scopes');
    expect(() => createExpensePostings(10n, cash, privateAccount)).toThrow('Mixed account scopes');
  });
});
