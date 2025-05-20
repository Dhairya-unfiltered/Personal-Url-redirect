const express = require('express');
require('dotenv').config();
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const Url = require('./models/Url');

const app = express();

app.set('view engine', 'ejs');
app.use(bodyParser.json());
app.use(express.static('public'));

// MongoDB connection caching for serverless
const MONGO_URI = process.env.MONGO_URI;
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectToDatabase() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }).then(mongoose => {
      return mongoose;
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

// Middleware to connect to DB on every request (only if not connected)
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (err) {
    next(err);
  }
});

// Helper: generate unique dummy link
const generateDummyLink = async () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let shortStr;
  let exists = true;

  while (exists) {
    shortStr = '';
    for (let i = 0; i < 6; i++) {
      shortStr += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const found = await Url.findOne({ dummylink: shortStr });
    if (!found) exists = false;
  }

  return shortStr;
};

// Routes

// Show profile with all dummy links
app.get('/profile', async (req, res, next) => {
  try {
    const urls = await Url.find().sort({ createdAt: -1 });
    res.render('profile', { urls });
  } catch (err) {
    next(err);
  }
});

// Generate new dummy link
app.post('/generate', async (req, res, next) => {
  try {
    const dummylink = await generateDummyLink();

    const newUrl = new Url({
      urlname: 'Dummy Link',
      dummylink,
      actuallink: null,
    });

    await newUrl.save();
    res.status(201).json({ dummylink });
  } catch (err) {
    next(err);
  }
});

// Edit actual link for dummy link
app.patch('/edit/:dummylink', async (req, res, next) => {
  try {
    const { actuallink } = req.body;
    const updated = await Url.findOneAndUpdate(
      { dummylink: req.params.dummylink },
      { actuallink },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Dummy link not found' });
    }

    res.json({ message: 'Actual link updated', updated });
  } catch (err) {
    next(err);
  }
});

// Redirect dummy link to actual link
app.get('/:dummylink', async (req, res, next) => {
  try {
    const url = await Url.findOne({ dummylink: req.params.dummylink });
    if (!url) {
      return res.status(404).send('Link not found');
    }
    if (!url.actuallink) {
      return res.status(400).send('Actual link not set yet');
    }
    res.redirect(url.actuallink);
  } catch (err) {
    next(err);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack || err);
  res.status(500).send('Internal Server Error');
});

module.exports = app;
