import { DEMO } from './config';

// A fictional student, so the synthetic pages can show own-name masking.
export async function loadOwnIdentity() {
  return { email: DEMO.email, names: ['Sample Student'] };
}
