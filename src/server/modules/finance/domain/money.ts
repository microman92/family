const POSTGRES_BIGINT_MAX = 9223372036854775807n;

/** Parse positive whole sums from the API without a JavaScript number conversion. */
export function parseMoneyUZS(value: string): bigint {
  if (value.length > 19 || !/^[1-9][0-9]*$/.test(value)) throw new Error('Invalid UZS amount');
  const amount = BigInt(value);
  if (amount > POSTGRES_BIGINT_MAX) throw new Error('UZS amount exceeds database range');
  return amount;
}

export function formatMoneyUZS(amount: bigint): string {
  if (amount < -POSTGRES_BIGINT_MAX - 1n || amount > POSTGRES_BIGINT_MAX)
    throw new Error('UZS amount exceeds database range');
  return amount.toString();
}
