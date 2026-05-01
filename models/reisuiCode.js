const mongoose = require('mongoose');

const reisuiDbName = process.env.REISUI_DB_NAME || 'reisui';
const reisuiCodesCollection = process.env.REISUI_CODES_COLLECTION || 'codes';

const reisuiDb = mongoose.connection.useDb(reisuiDbName, { useCache: true });

const reisuiCodeSchema = new mongoose.Schema({
  code: String,
  serial: String,
  serialNumber: String,
  number: String,
  used: {
    type: Boolean,
    default: false,
  },
}, {
  collection: reisuiCodesCollection,
  strict: false,
});

const ReisuiCode = reisuiDb.models.ReisuiCode
  || reisuiDb.model('ReisuiCode', reisuiCodeSchema);

module.exports = ReisuiCode;
