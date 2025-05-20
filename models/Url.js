const mongoose = require('mongoose');

const urlSchema = new mongoose.Schema({
  urlname: { type: String },
  dummylink: { type: String, required: true, unique: true },
  actuallink: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Url', urlSchema);
