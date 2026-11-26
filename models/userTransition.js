const mongoose = require('mongoose');

// Every change to an account's points: AI charges (amount -1) and adjustments by an admin
const userTransitionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, index: true },
  amount: Number,
  type: String,
  ip: String,
  // For admin adjustments: why, and which admin (their sub)
  reason: String,
  actor: String,
}, { timestamps: true, collection: 'usertransitions' });

module.exports = mongoose.models.UserTransition
  || mongoose.model('UserTransition', userTransitionSchema);
