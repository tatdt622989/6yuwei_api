const mongoose = require('mongoose');

const dictDbName = process.env.DICT_DB_NAME || 'japanese_learning_app';

/**
 * Opens a database with its own limited account. Without a URL it falls back to the main
 * connection, so a deployment works before the accounts are configured.
 */
function openDb(url, name) {
  if (!url) return mongoose.connection.useDb(dictDbName, { useCache: true });
  const connection = mongoose.createConnection(url, { family: 4 });
  // A failed connection must not end the process, because only these routes depend on it
  const logError = (error) => console.error(`${name} connection error: ${error.message}`);
  connection.on('error', logError);
  connection.asPromise().catch(logError);
  return connection.useDb(dictDbName, { useCache: true });
}

module.exports = {
  editorDb: openDb(process.env.DICT_EDITOR_DB_URL, 'dict editor'),
  readerDb: openDb(process.env.DICT_READER_DB_URL, 'dict reader'),
};
