const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  verified: { type: Boolean, default: false },
  verificationToken: String,
  resetToken: String,
  resetTokenExpiry: Date,
  urls: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Url' }]
});

module.exports = mongoose.model('User', userSchema);
