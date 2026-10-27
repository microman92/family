const integerString = /^-?(0|[1-9]\d*)$/;
const moneyFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

export function formatUZS(value: bigint | string): string {
  if (typeof value === 'string' && !integerString.test(value)) {
    throw new TypeError('Ожидалась целая сумма UZS');
  }
  return `${moneyFormatter.format(BigInt(value))} сум`;
}

export function formatLocalDate(value: string | Date, timeZone = 'Asia/Tashkent'): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) throw new TypeError('Некорректная дата');
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone,
  }).format(date);
}

export function formatCalendarDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('Ожидалась дата YYYY-MM-DD');
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new TypeError('Некорректная календарная дата');
  }
  return formatLocalDate(date, 'UTC');
}
