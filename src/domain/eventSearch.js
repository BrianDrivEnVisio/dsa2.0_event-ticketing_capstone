import { DomainError } from './errors.js';
import { mergeSort } from './sorting.js';

function assertSummaries(summaries) {
  if (!Array.isArray(summaries)) {
    throw new DomainError('summaries must be an array.', 'VALIDATION');
  }
}

function assertRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainError(`${label} must be an object.`, 'VALIDATION');
  }
}

function isIsoDate(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const dateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  if (!dateOnly && !dateTime || !Number.isFinite(Date.parse(value))) {
    return false;
  }

  const datePart = value.slice(0, 10);
  return new Date(`${datePart}T00:00:00.000Z`).toISOString().slice(0, 10) === datePart;
}

function dateValue(value, label) {
  if (!isIsoDate(value)) {
    throw new DomainError(`${label} must be a real ISO date or date-time.`, 'VALIDATION');
  }
  return Date.parse(value);
}

function tierList(summary) {
  return Array.isArray(summary.tiers) ? summary.tiers : [];
}

function cheapestPrice(summary) {
  const tiers = tierList(summary);
  if (tiers.length === 0) {
    return null;
  }

  let cheapest = Infinity;
  for (const tier of tiers) {
    if (!Number.isSafeInteger(tier.priceCents) || tier.priceCents < 0) {
      throw new DomainError('Tier priceCents must be a non-negative whole number.', 'VALIDATION');
    }
    cheapest = Math.min(cheapest, tier.priceCents);
  }
  return cheapest;
}

function availableSeats(summary) {
  return tierList(summary).reduce((total, tier) => {
    const available = tier.available ?? tier.seatsLeft ?? 0;
    if (!Number.isSafeInteger(available) || available < 0) {
      throw new DomainError('Available seats must be a non-negative whole number.', 'VALIDATION');
    }
    return total + available;
  }, 0);
}

function compareStrings(left, right) {
  const leftText = String(left ?? '');
  const rightText = String(right ?? '');
  const leftLower = leftText.toLowerCase();
  const rightLower = rightText.toLowerCase();
  if (leftLower < rightLower) return -1;
  if (leftLower > rightLower) return 1;
  if (leftText < rightText) return -1;
  if (leftText > rightText) return 1;
  return 0;
}

function compareTitleAndId(left, right) {
  return compareStrings(left.title, right.title) || compareStrings(left.id, right.id);
}

export function filterEvents(summaries, criteria = {}) {
  assertSummaries(summaries);
  assertRecord(criteria, 'criteria');

  const { q, city, from, to, maxPriceCents, onlyAvailable } = criteria;
  if (q !== undefined && typeof q !== 'string') {
    throw new DomainError('q must be a string.', 'VALIDATION');
  }
  if (city !== undefined && typeof city !== 'string') {
    throw new DomainError('city must be a string.', 'VALIDATION');
  }
  if (from !== undefined) dateValue(from, 'from');
  if (to !== undefined) dateValue(to, 'to');
  if (maxPriceCents !== undefined
    && (!Number.isSafeInteger(maxPriceCents) || maxPriceCents < 0)) {
    throw new DomainError('maxPriceCents must be a non-negative whole number.', 'VALIDATION');
  }
  if (onlyAvailable !== undefined && typeof onlyAvailable !== 'boolean') {
    throw new DomainError('onlyAvailable must be a boolean.', 'VALIDATION');
  }

  const searchText = q?.trim().toLowerCase();
  const cityText = city?.trim().toLowerCase();
  const fromTime = from === undefined ? null : Date.parse(from);
  const toTime = to === undefined
    ? null
    : /^\d{4}-\d{2}-\d{2}$/.test(to)
      ? Date.parse(`${to}T23:59:59.999Z`)
      : Date.parse(to);

  return summaries.filter((summary) => {
    if (summary.published === false || summary.status === 'draft') {
      return false;
    }
    if (searchText) {
      const title = String(summary.title ?? '').toLowerCase();
      const venue = String(summary.venue ?? '').toLowerCase();
      if (!title.includes(searchText) && !venue.includes(searchText)) {
        return false;
      }
    }
    if (cityText && String(summary.city ?? '').toLowerCase() !== cityText) {
      return false;
    }
    if (fromTime !== null || toTime !== null) {
      const eventTime = dateValue(summary.date, 'event date');
      if (fromTime !== null && eventTime < fromTime) {
        return false;
      }
      if (toTime !== null && eventTime > toTime) {
        return false;
      }
    }
    if (maxPriceCents !== undefined) {
      const price = cheapestPrice(summary);
      if (price === null || price > maxPriceCents) {
        return false;
      }
    }
    return onlyAvailable !== true || availableSeats(summary) > 0;
  });
}

export function sortEvents(summaries, sortBy) {
  assertSummaries(summaries);
  if (!['date', 'price', 'availability'].includes(sortBy)) {
    throw new DomainError(`Unknown event sort option "${sortBy}".`, 'VALIDATION');
  }

  return mergeSort(summaries, (left, right) => {
    let comparison = 0;
    if (sortBy === 'date') {
      dateValue(left.date, 'event date');
      dateValue(right.date, 'event date');
      const leftDay = left.date.slice(0, 10);
      const rightDay = right.date.slice(0, 10);
      comparison = leftDay < rightDay ? -1 : leftDay > rightDay ? 1 : 0;
    } else if (sortBy === 'price') {
      const leftPrice = cheapestPrice(left);
      const rightPrice = cheapestPrice(right);
      if (leftPrice === null && rightPrice !== null) return 1;
      if (leftPrice !== null && rightPrice === null) return -1;
      comparison = (leftPrice ?? 0) - (rightPrice ?? 0);
    } else {
      comparison = availableSeats(right) - availableSeats(left);
    }

    return comparison || compareTitleAndId(left, right);
  });
}

export function searchEvents(summaries, criteria, sortBy) {
  return sortEvents(filterEvents(summaries, criteria), sortBy);
}
