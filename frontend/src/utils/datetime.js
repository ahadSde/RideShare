export function parseServerDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized);
  if (!hasTimezone) {
    const match = normalized.match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?$/
    );

    if (match) {
      const [
        ,
        year,
        month,
        day,
        hour,
        minute,
        second = '0',
        millisecond = '0',
      ] = match;

      const parsedLocal = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
        Number(millisecond.padEnd(3, '0'))
      );

      return Number.isNaN(parsedLocal.getTime()) ? null : parsedLocal;
    }
  }

  const parsed = new Date(normalized);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatServerDateTime(value, locale = 'en-IN', options = {}) {
  const parsed = parseServerDate(value);
  if (!parsed) return '—';

  return parsed.toLocaleString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...options,
  });
}

export function formatServerDate(value, locale = 'en-IN', options = {}) {
  const parsed = parseServerDate(value);
  if (!parsed) return '—';

  return parsed.toLocaleDateString(locale, options);
}

export function formatServerTime(value, locale = 'en-IN', options = {}) {
  const parsed = parseServerDate(value);
  if (!parsed) return '—';

  return parsed.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  });
}

export function getLocalDateInputValue(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getLocalTimeInputValue(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
