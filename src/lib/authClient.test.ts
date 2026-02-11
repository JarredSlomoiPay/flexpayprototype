import { describe, expect, it } from 'vitest';
import { isAllowedEmail } from './authClient';

describe('authClient domain restrictions', () => {
  it('allows only pay.com.au and waller.com.au emails', () => {
    expect(isAllowedEmail('user@pay.com.au')).toBe(true);
    expect(isAllowedEmail('user@waller.com.au')).toBe(true);
    expect(isAllowedEmail('USER@PAY.COM.AU')).toBe(true);

    expect(isAllowedEmail('user@gmail.com')).toBe(false);
    expect(isAllowedEmail('user@pay.com')).toBe(false);
    expect(isAllowedEmail('invalid-email')).toBe(false);
  });
});

