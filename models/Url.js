const mongoose = require('mongoose');

const urlSchema = new mongoose.Schema({
  urlname: String,
  dummylink: { type: String, required: true, unique: true },
  actuallink: String,
  createdAt: { type: Date, default: Date.now },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

module.exports = mongoose.model('Url', urlSchema);
