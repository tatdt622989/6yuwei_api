const { Server } = require('socket.io');
const { getAllowedOrigins } = require('../config/origins');
const socketHandlers = require('./socketHandlers');

const env = process.env.NODE_ENV;

module.exports = (server) => {
  // 跨域設定
  const allowedOrigins = getAllowedOrigins(env);
  const io = new Server(server, {
    path: '/guessai_canvas/socket.io/',
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    // CORS does not cover WebSocket connections, so check the page they come from here
    allowRequest: (req, callback) => {
      const { origin } = req.headers;
      callback(null, !origin || allowedOrigins.includes(origin));
    },
  });

  // socket.io
  io.on('connection', (socket) => {
    const accessToken = socket.handshake.headers.cookie?.split('guessai_canvas_access_token=')[1]?.split(';')[0];
    // eslint-disable-next-line no-param-reassign
    socket.accessToken = accessToken; // save accessToken to socket
    console.log('a user connected');

    socketHandlers(io, socket, accessToken);
  });
};
