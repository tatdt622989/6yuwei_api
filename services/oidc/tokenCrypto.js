const crypto = require('crypto');

/**
 * Encrypts refresh tokens kept in web_sessions (AES-256-GCM), so a copy of the database alone
 * cannot sign anyone in. The key is SESSION_TOKEN_KEY: 32 bytes, base64.
 */
const createTokenCrypto = (base64Key) => {
  const key = Buffer.from(String(base64Key ?? ''), 'base64');
  if (key.length !== 32) throw new Error('SESSION_TOKEN_KEY must be 32 bytes in base64');

  return {
    encrypt(text) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
      return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64url')).join('.');
    },
    decrypt(value) {
      const [iv, tag, data] = String(value).split('.').map((part) => Buffer.from(part, 'base64url'));
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    },
  };
};

module.exports = { createTokenCrypto };
