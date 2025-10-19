import { sanitizeString } from './helpers';

export const splitFullName = (fullName: string): { firstName: string; lastName: string } => {
  const normalized = fullName.trim().replace(/\s+/g, ' ');
  const parts = normalized.split(' ');

  if (parts.length === 1) {
    return { firstName: sanitizeString(parts[0] ?? ''), lastName: '' };
  }

  const firstNamePart = parts.shift() ?? '';
  const firstName = sanitizeString(firstNamePart);
  const lastName = sanitizeString(parts.join(' '));

  return { firstName, lastName };
};
