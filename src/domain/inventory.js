import { DomainError } from './errors.js';
import { newId, newReference } from './ids.js';
import { Queue } from './waitlistQueue.js';

const stores = new WeakSet();

function assertRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainError(`${label} must be an object.`, 'VALIDATION');
  }
}

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainError(`${label} must be a non-empty string.`, 'VALIDATION');
  }

  return value.trim();
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DomainError(`${label} must be a positive whole number.`, 'VALIDATION');
  }

  return value;
}

function nonNegativeCents(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError(`${label} must be a non-negative whole number of cents.`, 'VALIDATION');
  }

  return value;
}

function assertStore(store) {
  if (store === null || typeof store !== 'object' || !stores.has(store)) {
    throw new DomainError('A store created by createStore() is required.', 'VALIDATION');
  }
}

function getEvent(store, eventId) {
  const id = requiredString(eventId, 'eventId');
  const event = store.events.get(id);
  if (!event) {
    throw new DomainError(`Event "${id}" was not found.`, 'NOT_FOUND');
  }
  return event;
}

function getTier(event, tierId) {
  const id = requiredString(tierId, 'tierId');
  const tier = event.tiers.get(id);
  if (!tier) {
    throw new DomainError(`Ticket tier "${id}" was not found for this event.`, 'NOT_FOUND');
  }
  return tier;
}

function bookingQuantity(value) {
  const quantity = positiveInteger(value, 'quantity');
  if (quantity > 10) {
    throw new DomainError('A booking must contain between 1 and 10 tickets.', 'VALIDATION');
  }
  return quantity;
}

export function createStore() {
  const store = {
    events: new Map(),
    bookings: [],
    bookingsByReference: new Map(),
    waitlists: new Map(),
  };
  stores.add(store);
  return store;
}

export function createEvent(store, input) {
  assertStore(store);
  assertRecord(input, 'Event');
  const name = requiredString(input.name, 'name');

  const event = {
    id: newId(),
    name,
    tiers: new Map(),
  };
  store.events.set(event.id, event);
  return event;
}

export function addTier(store, eventId, input) {
  assertStore(store);
  assertRecord(input, 'Ticket tier');
  const event = getEvent(store, eventId);
  const name = requiredString(input.name, 'name');
  const capacity = positiveInteger(input.capacity, 'capacity');
  const priceCents = nonNegativeCents(input.priceCents, 'priceCents');

  if ([...event.tiers.values()].some((tier) => tier.name === name)) {
    throw new DomainError(`Ticket tier "${name}" already exists for this event.`, 'DUPLICATE_TIER');
  }

  const tier = {
    id: newId(),
    eventId: event.id,
    name,
    capacity,
    available: capacity,
    priceCents,
  };
  event.tiers.set(tier.id, tier);
  return tier;
}

export function bookTickets(store, input) {
  assertStore(store);
  assertRecord(input, 'Booking');
  const event = getEvent(store, input.eventId);
  const tier = getTier(event, input.tierId);
  const attendeeName = requiredString(input.attendeeName, 'attendeeName');
  const quantity = bookingQuantity(input.quantity);

  if (tier.available < quantity) {
    throw new DomainError(
      `Only ${tier.available} ticket(s) remain in the "${tier.name}" tier.`,
      'SOLD_OUT',
    );
  }

  const totalCents = tier.priceCents * quantity;
  if (!Number.isSafeInteger(totalCents)) {
    throw new DomainError('The booking total exceeds the supported cents range.', 'VALIDATION');
  }

  let reference = newReference();
  while (store.bookingsByReference.has(reference)) {
    reference = newReference();
  }

  const booking = {
    id: newId(),
    reference,
    eventId: event.id,
    tierId: tier.id,
    attendeeName,
    quantity,
    unitPriceCents: tier.priceCents,
    totalCents,
    status: 'booked',
  };

  tier.available -= quantity;
  store.bookings.push(booking);
  store.bookingsByReference.set(reference, booking);
  return booking;
}

export function cancelBooking(store, reference) {
  assertStore(store);
  const code = requiredString(reference, 'reference').toUpperCase();
  const booking = store.bookingsByReference.get(code);
  if (!booking) {
    throw new DomainError(`Booking "${code}" was not found.`, 'NOT_FOUND');
  }
  if (booking.status === 'cancelled') {
    throw new DomainError(`Booking "${code}" has already been cancelled.`, 'ALREADY_CANCELLED');
  }

  const event = store.events.get(booking.eventId);
  const tier = event?.tiers.get(booking.tierId);
  if (!tier) {
    throw new DomainError('The booking ticket tier could not be found.', 'NOT_FOUND');
  }

  tier.available += booking.quantity;
  booking.status = 'cancelled';
  return booking;
}

export function findBookingByReference(store, reference) {
  assertStore(store);
  const code = requiredString(reference, 'reference').toUpperCase();
  return store.bookingsByReference.get(code) ?? null;
}

export function joinWaitlist(store, input) {
  assertStore(store);
  assertRecord(input, 'Waitlist entry');
  const event = getEvent(store, input.eventId);
  const tier = getTier(event, input.tierId);
  const attendeeName = requiredString(input.attendeeName, 'attendeeName');
  const quantity = bookingQuantity(input.quantity);

  const entry = {
    id: newId(),
    eventId: event.id,
    tierId: tier.id,
    attendeeName,
    quantity,
  };
  let queue = store.waitlists.get(tier.id);
  if (!queue) {
    queue = new Queue();
    store.waitlists.set(tier.id, queue);
  }
  queue.enqueue(entry);
  return entry;
}
