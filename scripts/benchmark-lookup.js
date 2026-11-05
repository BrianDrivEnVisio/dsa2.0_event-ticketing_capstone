import { performance } from 'node:perf_hooks';

const BOOKINGS = 100_000;
const LOOKUPS = 500;
const bookings = Array.from({ length: BOOKINGS }, (_, index) => ({
  reference: `BOOKING-${index}`,
}));
const bookingsByReference = new Map(
  bookings.map((booking) => [booking.reference, booking]),
);
const targetReference = bookings[bookings.length - 1].reference;

let foundByArray = null;
let startedAt = performance.now();
for (let index = 0; index < LOOKUPS; index += 1) {
  foundByArray = bookings.find((booking) => booking.reference === targetReference);
}
const arrayFindMs = performance.now() - startedAt;

let foundByMap = null;
startedAt = performance.now();
for (let index = 0; index < LOOKUPS; index += 1) {
  foundByMap = bookingsByReference.get(targetReference);
}
const mapGetMs = performance.now() - startedAt;

if (!foundByArray || !foundByMap) {
  throw new Error('Benchmark lookup failed to find the target booking.');
}

console.log(`Lookups: ${LOOKUPS} among ${BOOKINGS.toLocaleString()} bookings`);
console.log(`Array.find: ${arrayFindMs.toFixed(3)} ms`);
console.log(`Map.get:    ${mapGetMs.toFixed(3)} ms`);
console.log(`Map speedup: ${(arrayFindMs / mapGetMs).toFixed(1)}x`);
