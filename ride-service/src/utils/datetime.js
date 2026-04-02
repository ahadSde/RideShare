function normalizeUtcTimestamp(value) {
  if (!value) return value;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Date(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds()
  ));
}

function normalizeBookingDeadline(booking) {
  if (!booking?.payment_deadline) return booking;

  return {
    ...booking,
    payment_deadline: normalizeUtcTimestamp(booking.payment_deadline),
  };
}

module.exports = {
  normalizeUtcTimestamp,
  normalizeBookingDeadline,
};
