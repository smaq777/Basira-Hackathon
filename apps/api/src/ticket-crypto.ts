import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

export type TicketContact = { email: string; name?: string };

export function normalizeEmail(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

export function ticketCode(): string {
  return `BR-${randomBytes(6).toString('hex').toUpperCase()}`;
}

function encryptionKey(value: string): Buffer {
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('TICKET_DATA_KEY must be a base64-encoded 32-byte key');
  return key;
}

export function emailLookupHash(email: string, pepper: string): Buffer {
  if (pepper.length < 32)
    throw new Error('TICKET_LOOKUP_PEPPER must contain at least 32 characters');
  return createHmac('sha256', pepper).update(normalizeEmail(email), 'utf8').digest();
}

export function encryptTicketContact(contact: TicketContact, keyValue: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(keyValue), iv);
  const plaintext = Buffer.from(
    JSON.stringify({
      email: normalizeEmail(contact.email),
      ...(contact.name?.trim() ? { name: contact.name.trim() } : {}),
    }),
    'utf8',
  );
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

export function decryptTicketContact(ciphertext: Buffer, keyValue: string): TicketContact {
  if (ciphertext.length < 29) throw new Error('INVALID_TICKET_CONTACT');
  const iv = ciphertext.subarray(0, 12);
  const tag = ciphertext.subarray(12, 28);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(keyValue), iv);
  decipher.setAuthTag(tag);
  const value = JSON.parse(
    Buffer.concat([decipher.update(ciphertext.subarray(28)), decipher.final()]).toString('utf8'),
  ) as Partial<TicketContact>;
  if (typeof value.email !== 'string' || !value.email) throw new Error('INVALID_TICKET_CONTACT');
  return { email: value.email, ...(typeof value.name === 'string' ? { name: value.name } : {}) };
}
