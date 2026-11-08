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

function validIsoDate(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const dateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  if (!dateOnly && !dateTime) {
    return false;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const datePart = value.slice(0, 10);
  return new Date(`${datePart}T00:00:00.000Z`).toISOString().slice(0, 10) === datePart;
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
  const legacyInput = input.title === undefined
    && input.city === undefined
    && input.venue === undefined
    && input.date === undefined
    && typeof input.name === 'string';
  const title = requiredString(legacyInput ? input.name : input.title, 'title');
  const details = legacyInput
    ? {}
    : {
      city: requiredString(input.city, 'city'),
      venue: requiredString(input.venue, 'venue'),
      date: requiredString(input.date, 'date'),
    };

  if (!legacyInput && !validIsoDate(details.date)) {
    throw new DomainError('date must be a real ISO date or date-time.', 'VALIDATION');
  }

  const event = {
    id: newId(),
    title,
    name: title,
    ...details,
    published: false,
    status: 'draft',
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
    sold: 0,
    priceCents,
  };
  event.tiers.set(tier.id, tier);
  return tier;
}

export function publishEvent(store, eventId) {
  assertStore(store);
  const event = getEvent(store, eventId);
  if (event.tiers.size === 0) {
    throw new DomainError('An event must have at least one ticket tier before it can be published.', 'INVALID_STATE');
  }

  event.published = true;
  event.status = 'published';
  return event;
}

export function unpublishEvent(store, eventId) {
  assertStore(store);
  const event = getEvent(store, eventId);
  event.published = false;
  event.status = 'draft';
  return event;
}

export function listEventSummaries(store, options = {}) {
  assertStore(store);
  assertRecord(options, 'options');
  const { publishedOnly = true } = options;
  if (typeof publishedOnly !== 'boolean') {
    throw new DomainError('publishedOnly must be a boolean.', 'VALIDATION');
  }

  return [...store.events.values()]
    .filter((event) => !publishedOnly || event.published)
    .map((event) => ({
      id: event.id,
      title: event.title,
      name: event.name,
      city: event.city,
      venue: event.venue,
      date: event.date,
      published: event.published,
      status: event.status,
      tiers: [...event.tiers.values()].map((tier) => ({ ...tier })),
    }));
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
    status: 'pending',
  };

  tier.available -= quantity;
  tier.sold += quantity;
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
  tier.sold -= booking.quantity;
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
