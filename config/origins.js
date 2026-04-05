const sharedFrontendOrigins = [
  'https://app.6yuwei.com',
];

const guessAICanvasDedicatedOrigins = [
  'https://guessai-canvas.6yuwei.com',
];

const productionOrigins = [
  'https://6yuwei.com',
  'https://ai.6yuwei.com',
  'https://api.6yuwei.com',
  'https://www.6yuwei.com',
  ...sharedFrontendOrigins,
  ...guessAICanvasDedicatedOrigins,
];

const developmentOrigins = [
  'http://localhost:3000',
  'http://localhost:8888',
  'http://127.0.0.1:5500',
  'http://localhost:3002',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://localhost:5173',
];

const getAllowedOrigins = (env) => (
  env === 'development' ? developmentOrigins : productionOrigins
);

const guessAICanvasCspOrigins = [
  ...sharedFrontendOrigins,
  ...guessAICanvasDedicatedOrigins,
];

const guessAICanvasContentSecurityPolicyDirectives = {
  defaultSrc: ["'self'", ...guessAICanvasCspOrigins],
  scriptSrc: ["'self'", "'unsafe-inline'", ...guessAICanvasCspOrigins],
  styleSrc: ["'self'", "'unsafe-inline'", ...guessAICanvasCspOrigins],
  frameAncestors: ["'self'", ...guessAICanvasCspOrigins],
};

module.exports = {
  developmentOrigins,
  getAllowedOrigins,
  guessAICanvasContentSecurityPolicyDirectives,
  guessAICanvasDedicatedOrigins,
  productionOrigins,
  sharedFrontendOrigins,
};
