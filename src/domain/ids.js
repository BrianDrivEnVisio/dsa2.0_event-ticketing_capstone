import { randomInt, randomUUID } from 'node:crypto';

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REFERENCE_LENGTH = 8;

export function newId() {
  return randomUUID();
}

export function newReference() {
  let reference = '';

  for (let index = 0; index < REFERENCE_LENGTH; index += 1) {
    reference += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  }

  return `${reference.slice(0, 4)}-${reference.slice(4)}`;
}
