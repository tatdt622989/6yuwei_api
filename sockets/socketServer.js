const { Server } = require('socket.io');
const socketHandlers = require('./socketHandlers');

const env = process.env.NODE_ENV;

module.exports = (server) => {
  // 跨域設定
  let allowedOrigins = ['https://6yuwei.com', 'https://ai.6yuwei.com', 'https://api.6yuwei.com', 'https://www.6yuwei.com', 'https://app.6yuwei.com'];
  if (env === 'development') {
    allowedOrigins = ['http://localhost:3000', 'http://localhost:8888', 'http://127.0.0.1:5500', 'http://localhost:3002', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://localhost:5173'];
  }
  const io = new Server(server, {
    path: '/guessai_canvas/socket.io/',
    cors: {
      origin: allowedOrigins,
      credentials: true,
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

  io.on('connection_error', (err) => {
    console.log(err.req); // the request object
    console.log(err.code); // the error code, for example 1
    console.log(err.message); // the error message, for example "Session ID unknown"
    console.log(err.context); // some additional error context
  });
};
