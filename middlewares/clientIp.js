const net = require('net');

// https://www.cloudflare.com/ips/
const CLOUDFLARE_RANGES = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18',
  '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17',
  '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32',
  '2a06:98c0::/29', '2c0f:f248::/32',
];

const cloudflare = new net.BlockList();
CLOUDFLARE_RANGES.forEach((range) => {
  const [address, bits] = range.split('/');
  cloudflare.addSubnet(address, Number(bits), address.includes(':') ? 'ipv6' : 'ipv4');
});

const isCloudflare = (ip) => {
  const version = net.isIP(ip);
  return version !== 0 && cloudflare.check(ip, version === 6 ? 'ipv6' : 'ipv4');
};

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

// The last entry is added by our own proxy. Every earlier entry can be typed by the client.
const getProxyPeer = (value) => getHeaderValue(value)
  .split(',')
  .map((ip) => normalizeIp(ip))
  .filter(Boolean)
  .pop() || '';

const getClientIp = (req) => {
  const peer = getProxyPeer(req.headers['x-forwarded-for'])
    || normalizeIp(req.socket?.remoteAddress || '');

  // The server can also be reached directly, so this header counts only when Cloudflare sent it
  const cfConnectingIp = normalizeIp(getHeaderValue(req.headers['cf-connecting-ip']));
  if (net.isIP(cfConnectingIp) && isCloudflare(peer)) {
    return cfConnectingIp;
  }

  return peer || 'unknown';
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
