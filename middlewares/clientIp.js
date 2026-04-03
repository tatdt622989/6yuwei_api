const getHeaderValue = (value) => {
  if (Array.isArray(value)) {
    return value.find(Boolean) || '';
  }

  return value || '';
};

const normalizeIp = (value = '') => {
  const ip = String(value).trim();

  if (!ip) {
    return '';
  }

  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }

  if (ip === '::1') {
    return '127.0.0.1';
  }

  return ip;
};

const getForwardedIp = (value) => getHeaderValue(value)
  .split(',')
  .map((ip) => normalizeIp(ip))
  .find(Boolean) || '';

const getClientIp = (req) => {
  const cfConnectingIp = normalizeIp(getHeaderValue(req.headers['cf-connecting-ip']));
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  const xRealIp = normalizeIp(getHeaderValue(req.headers['x-real-ip']));
  if (xRealIp) {
    return xRealIp;
  }

  const forwardedIp = getForwardedIp(req.headers['x-forwarded-for']);
  if (forwardedIp) {
    return forwardedIp;
  }

  return normalizeIp(req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || '') || 'unknown';
};

const attachClientIp = (req, res, next) => {
  req.clientIp = getClientIp(req);
  next();
};

module.exports = {
  attachClientIp,
  getClientIp,
  normalizeIp,
};
