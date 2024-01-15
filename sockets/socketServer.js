const { Server } = require('socket.io');
const socketHandlers = require('./socketHandlers');

module.exports = (server) => {
  const io = new Server(server, {
    cors: {
      origin: ['https://6yuwei.com', 'https://ai.6yuwei.com', 'https://api.6yuwei.com', 'https://www.6yuwei.com', 'http://localhost:3000', 'http://localhost:5173', 'http://localhost:3001', 'http://localhost:8888'],
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
