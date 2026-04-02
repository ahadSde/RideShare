export function parseServerDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized);
  const parsed = new Date(hasTimezone ? normalized : normalized);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
