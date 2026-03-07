export function toIsoString(dateStr: string): string {
  if (!dateStr) return '2024-01-15T00:00:00Z';
  if (dateStr.includes('T')) return dateStr;
  return `${dateStr}T00:00:00Z`;
}

export function toDateObject(dateStr: string): Date {
  return new Date(toIsoString(dateStr));
}

export function toShortDate(dateStr: string): string {
  if (!dateStr) return '2024-01-15';
  return dateStr.substring(0, 10);
}
