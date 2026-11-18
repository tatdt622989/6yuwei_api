const mongoose = require('mongoose');

// What this API keeps about an account (data.md §3.1). _id is the account's sub
const userProfileSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId },
  balance: { type: Number, default: 30 },
  favoriteComponents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Component' }],
  // A read-only copy refreshed at each sign-in; the identity provider holds the original
  display: {
    name: String, email: String, picture: String, updatedAt: Date,
  },
}, { collection: 'user_profiles', versionKey: false, timestamps: true });

userProfileSchema.index({ 'display.email': 1 });
userProfileSchema.index({ 'display.name': 1 });

module.exports = mongoose.models.UserProfile || mongoose.model('UserProfile', userProfileSchema);
