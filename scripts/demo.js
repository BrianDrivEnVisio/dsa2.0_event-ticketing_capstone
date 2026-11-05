import {
  addTier,
  bookTickets,
  cancelBooking,
  createEvent,
  createStore,
  findBookingByReference,
  joinWaitlist,
} from '../src/domain/inventory.js';
import { DomainError } from '../src/domain/errors.js';

const store = createStore();
const event = createEvent(store, { name: 'Summer Sounds' });
const tier = addTier(store, event.id, {
  name: 'General admission',
  capacity: 3,
  priceCents: 2500,
});

const ada = bookTickets(store, {
  eventId: event.id,
  tierId: tier.id,
  attendeeName: 'Ada',
  quantity: 2,
});
console.log(`${ada.attendeeName} booked ${ada.quantity} of ${tier.capacity} seats.`);

try {
  bookTickets(store, {
    eventId: event.id,
    tierId: tier.id,
    attendeeName: 'Bayo',
    quantity: 2,
  });
} catch (error) {
  if (!(error instanceof DomainError) || error.code !== 'SOLD_OUT') {
    throw error;
  }
  console.log(`Bayo's booking was refused (${error.code}): ${error.message}`);
}

const chidi = bookTickets(store, {
  eventId: event.id,
  tierId: tier.id,
  attendeeName: 'Chidi',
  quantity: 1,
});
console.log(`The event is now sold out; ${chidi.attendeeName} booked the last seat.`);

const firstInLine = joinWaitlist(store, {
  eventId: event.id,
  tierId: tier.id,
  attendeeName: 'Dara',
  quantity: 1,
});
const secondInLine = joinWaitlist(store, {
  eventId: event.id,
  tierId: tier.id,
  attendeeName: 'Efe',
  quantity: 1,
});
console.log(`${firstInLine.attendeeName} and ${secondInLine.attendeeName} joined the waitlist.`);

const found = findBookingByReference(store, ada.reference);
console.log(`Found ${found.attendeeName}'s booking by reference ${found.reference}.`);

cancelBooking(store, ada.reference);
console.log(`${ada.attendeeName} cancelled; ${tier.available} seats are available again.`);

const next = store.waitlists.get(tier.id).peek();
console.log(`Next in line: ${next.attendeeName}.`);
