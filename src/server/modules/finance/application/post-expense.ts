import { parseMoneyUZS } from '../domain/money';

export type ExpenseInput = {
  cashAccountId: string;
  amount: string;
  requestId: string;
  occurredAt: string;
  categoryId: string | null;
  description: string | null;
};

export interface ExpenseRepository {
  postExpense(input: ExpenseInput): Promise<string>;
}

export async function postExpense(
  input: ExpenseInput,
  repository: ExpenseRepository,
): Promise<string> {
  const amount = parseMoneyUZS(input.amount).toString();
  return repository.postExpense({ ...input, amount });
}
