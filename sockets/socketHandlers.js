const jwt = require('jsonwebtoken');
const OpenAI = require('openai');
const socketState = require('./socketState');
const {
  Messages, SimpleUser, GuessAICanvas, Theme,
} = require('../models/guessai_canvas');

const OpenAIAPIKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({
  apiKey: OpenAIAPIKey,
});

module.exports = (io, socket, accessToken) => {
  const state = socketState.getSocketState();
  const generateCanvas = async () => {
    console.log('generate canvas');
    if (state.isCanvasGenerating) {
      return;
    }
    state.isCanvasGenerating = true;
    let content = null;

    // get theme from db
    const themeCount = await Theme.countDocuments();
    const random = Math.floor(Math.random() * themeCount);
    const theme = await Theme.findOne().skip(random);

    // generate canvas

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4-1106-preview',
        messages: [
          {
            role: 'system',
            content: 'You are an HTML canvas expert and a painter who specializes in generating code based on themes, with an emphasis on code security.',
          },
          {
            role: 'user',
            content: `Using '${theme.themeEN}' as the theme, provide me with HTML canvas code, and return it in JSON format, within the constraint of 4500 characters.`,
          },
        ],
        temperature: 1,
        tools: [
          {
            type: 'function',
            function: {
              name: 'canvasDraw',
              description: 'Draw a canvas image that fits the theme using Canvas and JavaScript, without including any <html> tags. The canvas ratio should be 16:9.',
              parameters: {
                type: 'object',
                properties: {
                  code: {
                    type: 'string',
                    description: 'HTML canvas Tag with inline javascript',
                  },
                },
                required: ['code'],
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'canvasDraw' } },
      });

      content = response.choices[0]?.message?.tool_calls[0]?.function.arguments;
      if (!content
        || !content.code) {
        state.isCanvasGenerating = false;
        // retry
        // generateCanvas();
      }
      content = JSON.parse(content);
    } catch (err) {
      console.log(err);
      state.isCanvasGenerating = false;
      // retry
      // generateCanvas();
    }

    // save canvas to db
    const {
      code,
    } = content;

    try {
      const guessaiCanvas = new GuessAICanvas({
        canvas: code,
        answerTW: theme.themeTW,
        answerEN: theme.themeEN,
        answerJP: theme.themeJP,
        solved: false,
      });
      await guessaiCanvas.save();
    } catch (err) {
      console.log(err);
    }

    // emit canvas to all clients
    io.emit('server canvas', {
      status: 'done',
    });

    console.log('generate canvas done');
    state.isCanvasGenerating = false;
  };

  // get message from client
  socket.on('client message', async (msg) => {
    // verify token
    if (!accessToken) {
      return;
    }
    try {
      const decoded = await jwt.verify(accessToken, process.env.SECRET_KEY);
      if (!decoded) {
        return;
      }

      // get user data from db
      const user = await SimpleUser.findById(decoded.userId);
      if (!user) {
        return;
      }

      // Check if the user has sent 12 messages in 3 minutes or less.
      const now = new Date();
      const limitTime = new Date(now.getTime() - 3 * 60 * 1000);
      const messageCount = await Messages.countDocuments({
        user: decoded.userId,
        createdAt: { $gte: limitTime },
      });

      if (messageCount >= 12) {
        io.to(socket.id).emit('server message', {
          status: 'error',
          message: 'Please wait 3 minutes before sending another message.',
        });
        return;
      }

      // check newest canvas
      const guessaiCanvas = await GuessAICanvas.findOne().sort({ createdAt: -1 }).limit(1);
      // set message to db
      const message = new Messages({
        message: msg,
        user: decoded.userId,
        isCorrect: false,
      });

      if (guessaiCanvas && !guessaiCanvas.solved) {
        // check if message is correct
        const { answerTW, answerEN, answerJP } = guessaiCanvas;
        // if is english, convert to lower case
        const lowercaseMsg = msg.toLowerCase() ?? '';
        const lowercaseAnswerEN = answerEN.toLowerCase() ?? '';
        if ((lowercaseMsg === answerTW
          || lowercaseMsg === lowercaseAnswerEN
          || lowercaseMsg === answerJP
        ) && !guessaiCanvas.solved) {
          generateCanvas();

          // set message to db
          message.isCorrect = true;

          // set user score to db
          user.score = user.score || 0;
          user.score += 100;
          await user.save();

          // set canvas to db
          guessaiCanvas.solved = true;
          guessaiCanvas.correctRespondent = decoded.userId;
          await guessaiCanvas.save();

          // emit canvas to all clients
          io.emit('server canvas', {
            status: 'loading',
            prevAnswer: {
              answerTW,
              answerEN,
              answerJP,
            },
            correctRespondent: {
              name: user.name,
              photo: user.photo,
            },
          });

          // get top 30 users
          const users = await SimpleUser.find().sort({ score: -1 }).limit(30);

          // emit ranking to all clients
          io.emit('server ranking', users);
        }
      }

      await message.save();

      const canvasTime = guessaiCanvas.createdAt.getTime();
      const nowTime = Date.now();
      const differenceInMillis = nowTime - canvasTime;
      const differenceInMinutes = Math.floor(differenceInMillis / (1000 * 60));

      // get attempt data
      const attemptData = await Messages.find({ createdAt: { $gte: guessaiCanvas.createdAt } })
        .sort({ createdAt: -1 });
      const hasCorrect = attemptData.some((attempt) => attempt.isCorrect); // 是否有人答對
      if (!hasCorrect && differenceInMinutes > 10 && attemptData.length > 20) {
        // emit canvas to all clients
        io.emit('server canvas', {
          status: 'info',
          message: 'The theme has been changed.',
        });
        guessaiCanvas.solved = true;
        await guessaiCanvas.save();
        generateCanvas();
      }

      // emit message to all clients
      io.emit('server message', {
        user: {
          name: user.name,
          photo: user.photo,
        },
        message: msg,
        createdAt: message.createdAt,
        isCorrect: message.isCorrect,
      });
    } catch (err) {
      console.log(err);
    }
  });
};
