/** Calculates in thousandths of a sum without floating-point multiplication. */
export function calculatePlan(items: { planned_qty: number; planned_unit_price: number | null }[]) {
  let thousandths = 0n;
  let unknown = 0;
  for (const item of items) {
    if (item.planned_unit_price === null || !Number.isSafeInteger(item.planned_unit_price)) {
      unknown++;
      continue;
    }
    const match = /^(\d+)\.?([0-9]{0,3})$/.exec(String(item.planned_qty));
    if (!match) {
      unknown++;
      continue;
    }
    const quantity = BigInt(match[1]!) * 1000n + BigInt((match[2] || '').padEnd(3, '0'));
    thousandths += quantity * BigInt(item.planned_unit_price);
  }
  const whole = (thousandths / 1000n).toLocaleString('ru-RU');
  const fraction = (thousandths % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  return { amount: fraction ? `${whole},${fraction}` : whole, unknown };
}
