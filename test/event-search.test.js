import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '../src/domain/errors.js';
import { filterEvents, searchEvents, sortEvents } from '../src/domain/eventSearch.js';
import { mergeSort } from '../src/domain/sorting.js';

const events = [
  {
    id: 'lagos',
    title: 'Lagos Tech Meetup',
    city: 'Lagos',
    venue: 'Civic Hall',
    date: '2026-12-05T17:00:00Z',
    tiers: [{ priceCents: 5000, available: 2 }],
  },
  {
    id: 'abuja',
    title: 'Abuja Jazz Night',
    city: 'Abuja',
    venue: 'Jazz Room',
    date: '2026-12-04T20:00:00Z',
    tiers: [{ priceCents: 3000, available: 5 }],
  },
  {
    id: 'free-lagos',
    title: 'Z Free Lagos Gathering',
    city: 'Lagos',
    venue: 'Town Square',
    date: '2026-12-05T10:00:00Z',
    tiers: [],
  },
];

function assertValidation(action) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.code, 'VALIDATION');
    return true;
  });
}

test('S05: text search matches title or venue without case sensitivity', () => {
  assert.deepEqual(searchEvents(events, { q: 'JAZZ' }, 'date').map((event) => event.id), ['abuja']);
  assert.deepEqual(filterEvents(events, { q: 'CIVIC' }).map((event) => event.id), ['lagos']);
});

test('S05: city filtering ignores capitalization but matches the complete city', () => {
  assert.deepEqual(filterEvents(events, { city: 'lagos' }).map((event) => event.id), [
    'lagos',
    'free-lagos',
  ]);
});

test('S05: maximum price uses the cheapest tier, omits events without tiers, then sorts cheapest first', () => {
  const results = searchEvents(events, { maxPriceCents: 4000 }, 'price');

  assert.deepEqual(results.map((event) => event.id), ['abuja']);
});

test('S05: date sorting puts earlier events first and breaks same-date ties by title', () => {
  const results = sortEvents(events, 'date');

  assert.deepEqual(results.map((event) => event.id), ['abuja', 'lagos', 'free-lagos']);
});

test('S05: an inclusive date-only upper bound includes events later that day', () => {
  assert.deepEqual(filterEvents(events, { to: '2026-12-05' }).map((event) => event.id), [
    'lagos',
    'abuja',
    'free-lagos',
  ]);
});

test('date range start is inclusive', () => {
  assert.deepEqual(filterEvents(events, { from: '2026-12-05T17:00:00Z' }).map((event) => event.id), [
    'lagos',
  ]);
});

test('S05: invalid dates, fractional prices and unknown sort options reject with VALIDATION', () => {
  assertValidation(() => searchEvents(events, { from: '2026-02-30' }, 'date'));
  assertValidation(() => searchEvents(events, { maxPriceCents: 10.5 }, 'date'));
  assertValidation(() => searchEvents(events, {}, 'random'));
});

test('S05: search, filtering and sorting leave the original list and its items unchanged', () => {
  const original = structuredClone(events);
  filterEvents(events, { city: 'LAGOS' });
  searchEvents(events, { q: 'meetup' }, 'price');
  sortEvents(events, 'availability');

  assert.deepEqual(events, original);
});

test('S05: availability sorting is descending and breaks ties by title then id', () => {
  const tied = [
    { id: 'b', title: 'Beta', tiers: [{ priceCents: 1, available: 4 }] },
    { id: 'a', title: 'Alpha', tiers: [{ priceCents: 1, available: 4 }] },
    { id: 'low', title: 'Low', tiers: [{ priceCents: 1, available: 1 }] },
  ];

  assert.deepEqual(sortEvents(tied, 'availability').map((event) => event.id), ['a', 'b', 'low']);
});

test('S05: onlyAvailable excludes sold-out events', () => {
  const availability = [
    { id: 'open', title: 'Open', tiers: [{ priceCents: 1, available: 1 }] },
    { id: 'full', title: 'Full', tiers: [{ priceCents: 1, available: 0 }] },
    { id: 'no-tiers', title: 'No tiers', tiers: [] },
  ];

  assert.deepEqual(filterEvents(availability, { onlyAvailable: true }).map((event) => event.id), ['open']);
});

test('S05: price sorting breaks ties by title then id and puts events without tiers last', () => {
  const priceTies = [
    { id: 'z', title: 'Same', tiers: [{ priceCents: 300, available: 1 }] },
    { id: 'a', title: 'Same', tiers: [{ priceCents: 300, available: 1 }] },
    { id: 'no-price', title: 'Aardvark', tiers: [] },
    { id: 'cheap', title: 'Zed', tiers: [{ priceCents: 100, available: 1 }] },
  ];

  assert.deepEqual(sortEvents(priceTies, 'price').map((event) => event.id), [
    'cheap',
    'a',
    'z',
    'no-price',
  ]);
});

test('search and sort return a new empty list for empty input', () => {
  const empty = [];
  const result = searchEvents(empty, {}, 'date');
  const sorted = sortEvents(empty, 'price');
  const filtered = filterEvents(empty);

  assert.deepEqual(result, []);
  assert.notStrictEqual(result, empty);
  assert.notStrictEqual(sorted, empty);
  assert.notStrictEqual(filtered, empty);
  assert.deepEqual(empty, []);
});

test('mergeSort returns a new array without changing its input and preserves equal-item order', () => {
  const original = [
    { key: 1, label: 'first' },
    { key: 0, label: 'middle' },
    { key: 1, label: 'second' },
    { key: 1, label: 'third' },
  ];
  const snapshot = structuredClone(original);
  const result = mergeSort(original, (left, right) => left.key - right.key);

  assert.notStrictEqual(result, original);
  assert.deepEqual(result.map((item) => item.label), ['middle', 'first', 'second', 'third']);
  assert.deepEqual(original, snapshot);
});
