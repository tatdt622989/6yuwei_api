const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/cluster-adapter');
const { setupWorker } = require('@socket.io/sticky');
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
  });

  // if (process.env.NODE_ENV === 'production') {
  //   io.adapter(createAdapter());
  //   setupWorker(io);
  // }

  // socket.io
  io.on('connection', (socket) => {
    const accessToken = socket.handshake.headers.cookie?.split('guessai_canvas_access_token=')[1]?.split(';')[0];
    // eslint-disable-next-line no-param-reassign
    socket.accessToken = accessToken; // save accessToken to socket
    console.log('a user connected');

    socketHandlers(io, socket, accessToken);
  });

  io.on('connection_error', (err) => {
    console.log(err.req); // the request object
    console.log(err.code); // the error code, for example 1
    console.log(err.message); // the error message, for example "Session ID unknown"
    console.log(err.context); // some additional error context
  });
};
