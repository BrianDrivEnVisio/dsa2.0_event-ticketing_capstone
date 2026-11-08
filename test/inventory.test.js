import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '../src/domain/errors.js';
import {
  addTier,
  bookTickets,
  cancelBooking,
  createEvent,
  createStore,
  listEventSummaries,
  publishEvent,
  unpublishEvent,
} from '../src/domain/inventory.js';

function createDetailedEvent(store, overrides = {}) {
  return createEvent(store, {
    title: 'Lagos Tech Meetup',
    city: 'Lagos',
    venue: 'Civic Hall',
    date: '2026-12-05T17:00:00Z',
    ...overrides,
  });
}

function assertDomainError(action, code) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.code, code);
    return true;
  });
}

test('S02: a valid event is saved as a new draft and omitted from the public list', () => {
  const store = createStore();
  const event = createDetailedEvent(store);
  const secondEvent = createDetailedEvent(store, { title: 'Second Event' });

  assert.ok(event.id);
  assert.notEqual(event.id, secondEvent.id);
  assert.equal(event.title, 'Lagos Tech Meetup');
  assert.equal(event.city, 'Lagos');
  assert.equal(event.venue, 'Civic Hall');
  assert.equal(event.date, '2026-12-05T17:00:00Z');
  assert.equal(event.status, 'draft');
  assert.equal(event.published, false);
  assert.deepEqual(listEventSummaries(store), []);
  assert.equal(listEventSummaries(store, { publishedOnly: false }).length, 2);
});

test('S02: a missing title or city, or a non-real date, rejects without saving', () => {
  const store = createStore();
  const invalidEvents = [
    { city: 'Lagos', venue: 'Hall', date: '2026-12-05' },
    { title: 'Meetup', venue: 'Hall', date: '2026-12-05' },
    { title: 'Meetup', city: 'Lagos', date: '2026-12-05' },
    { title: 'Meetup', city: 'Lagos', venue: 'Hall', date: '2026-02-30' },
  ];

  for (const input of invalidEvents) {
    assertDomainError(() => createEvent(store, input), 'VALIDATION');
  }
  assert.equal(store.events.size, 0);
});

test('S03: a tier stores whole-cent price, zero sold and its full remaining capacity', () => {
  const store = createStore();
  const event = createDetailedEvent(store);
  const tier = addTier(store, event.id, {
    name: 'General',
    priceCents: 500000,
    capacity: 100,
  });

  assert.equal(tier.priceCents, 500000);
  assert.equal(tier.sold, 0);
  assert.equal(tier.available, 100);
});

test('S03: fractional prices and capacities below one reject with VALIDATION', () => {
  const store = createStore();
  const event = createDetailedEvent(store);

  assertDomainError(() => addTier(store, event.id, {
    name: 'Fractional',
    priceCents: 10.5,
    capacity: 2,
  }), 'VALIDATION');
  assertDomainError(() => addTier(store, event.id, {
    name: 'No seats',
    priceCents: 10,
    capacity: 0,
  }), 'VALIDATION');
  assert.equal(event.tiers.size, 0);
});

test('S03: adding a tier to a missing event rejects with NOT_FOUND', () => {
  const store = createStore();

  assertDomainError(() => addTier(store, 'missing-event', {
    name: 'General',
    priceCents: 100,
    capacity: 10,
  }), 'NOT_FOUND');
});

test('S04: publishing a tiered draft makes it public', () => {
  const store = createStore();
  const event = createDetailedEvent(store);
  addTier(store, event.id, { name: 'General', priceCents: 2500, capacity: 10 });

  assert.deepEqual(listEventSummaries(store), []);
  publishEvent(store, event.id);

  assert.equal(event.status, 'published');
  assert.equal(listEventSummaries(store)[0].id, event.id);
});

test('S04: publishing an event without ticket tiers rejects with INVALID_STATE', () => {
  const store = createStore();
  const event = createDetailedEvent(store);

  assertDomainError(() => publishEvent(store, event.id), 'INVALID_STATE');
  assert.equal(event.published, false);
  assert.equal(event.status, 'draft');
  assert.deepEqual(listEventSummaries(store), []);
});

test('S04: unpublishing hides the event from the public list', () => {
  const store = createStore();
  const event = createDetailedEvent(store);
  addTier(store, event.id, { name: 'General', priceCents: 2500, capacity: 10 });
  publishEvent(store, event.id);

  unpublishEvent(store, event.id);

  assert.equal(event.status, 'draft');
  assert.deepEqual(listEventSummaries(store), []);
  assert.equal(listEventSummaries(store, { publishedOnly: false })[0].id, event.id);
});

test('S06: booking two seats creates a pending whole-cent booking and releases one seat', () => {
  const store = createStore();
  const event = createDetailedEvent(store);
  const tier = addTier(store, event.id, { name: 'General', priceCents: 1250, capacity: 3 });
  publishEvent(store, event.id);

  const booking = bookTickets(store, {
    eventId: event.id,
    tierId: tier.id,
    attendeeName: 'Ada',
    quantity: 2,
  });

  assert.equal(booking.status, 'pending');
  assert.equal(booking.quantity, 2);
  assert.equal(booking.totalCents, 2500);
  assert.equal(tier.sold, 2);
  assert.equal(tier.available, 1);
});

test('S06: an over-capacity booking rejects with SOLD_OUT and changes nothing', () => {
  const store = createStore();
  const event = createDetailedEvent(store);
  const tier = addTier(store, event.id, { name: 'General', priceCents: 1250, capacity: 1 });
  const before = { available: tier.available, sold: tier.sold, bookings: store.bookings.length };

  assertDomainError(() => bookTickets(store, {
    eventId: event.id,
    tierId: tier.id,
    attendeeName: 'Ada',
    quantity: 2,
  }), 'SOLD_OUT');
  assert.deepEqual(
    { available: tier.available, sold: tier.sold, bookings: store.bookings.length },
    before,
  );
});

test('S06: zero, negative, fractional and over-limit quantities reject with VALIDATION', () => {
  const store = createStore();
  const event = createDetailedEvent(store);
  const tier = addTier(store, event.id, { name: 'General', priceCents: 1250, capacity: 100 });

  for (const quantity of [0, -1, 1.5, 11]) {
    assertDomainError(() => bookTickets(store, {
      eventId: event.id,
      tierId: tier.id,
      attendeeName: 'Ada',
      quantity,
    }), 'VALIDATION');
  }
  assert.equal(tier.available, 100);
  assert.equal(store.bookings.length, 0);
});

test('every existing domain error code is represented by a DomainError', () => {
  const store = createStore();
  const event = createDetailedEvent(store);
  const tier = addTier(store, event.id, { name: 'General', priceCents: 100, capacity: 2 });
  assertDomainError(() => addTier(store, event.id, {
    name: 'General',
    priceCents: 100,
    capacity: 2,
  }), 'DUPLICATE_TIER');

  const booking = bookTickets(store, {
    eventId: event.id,
    tierId: tier.id,
    attendeeName: 'Ada',
    quantity: 1,
  });
  cancelBooking(store, booking.reference);
  assertDomainError(() => cancelBooking(store, booking.reference), 'ALREADY_CANCELLED');
  assertDomainError(() => publishEvent(store, 'missing-event'), 'NOT_FOUND');
  assertDomainError(() => createEvent(store, null), 'VALIDATION');

  const defaultError = new DomainError('Default code');
  assert.equal(defaultError.code, 'DOMAIN_ERROR');
});
