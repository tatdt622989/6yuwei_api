const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Sites on other 6yuwei.com subdomains count as same-site, so browsers send them the login cookie.
 * Only the listed sites can change data with it. Apps and servers send no Origin header.
 */
const rejectForeignOrigins = (allowedOrigins) => (req, res, next) => {
  const origin = req.get('origin');
  if (
    READ_ONLY_METHODS.has(req.method)
    || !origin
    || !req.cookies.access_token
    || allowedOrigins.includes(origin)
  ) {
    return next();
  }
  return res.status(403).send('Origin not allowed');
};

module.exports = { rejectForeignOrigins };
