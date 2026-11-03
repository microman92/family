import 'server-only';
import { z } from 'zod';
import { getCurrentUser } from '@/server/access/index.server';
import { postExpense as executePostExpense } from '@/server/modules/finance/application/post-expense';

const expenseSchema = z.object({
  cashAccountId: z.uuid(),
  amount: z.string(),
  requestId: z.uuid(),
  occurredAt: z.iso.datetime({ offset: true }),
  categoryId: z.uuid().nullable(),
  description: z.string().max(2000).nullable(),
});

export async function postExpense(input: z.infer<typeof expenseSchema>): Promise<string> {
  const parsed = expenseSchema.parse(input);
  const { client } = await getCurrentUser();
  return executePostExpense(parsed, {
    async postExpense(expense) {
      const { data, error } = await client.rpc('post_finance_expense', {
        cash_account: expense.cashAccountId,
        amount_uzs: expense.amount,
        request_key: expense.requestId,
        happened_at: expense.occurredAt,
        expense_category: expense.categoryId,
        note: expense.description,
      });
      if (error || typeof data !== 'string') throw new Error('Не удалось записать расход');
      return data;
    },
  });
}
