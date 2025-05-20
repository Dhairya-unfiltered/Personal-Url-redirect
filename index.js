const express = require('express');
require('dotenv').config();
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const Url = require('./models/Url');
const app = express();
const PORT = process.env.PORT || 5000;

app.set('view engine', 'ejs');
app.use(bodyParser.json());
app.use(express.static('public'));



// Connect to MongoDB (change connection string if needed)
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.log(err));

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
app.get('/profile', async (req, res) => {
  const urls = await Url.find().sort({ createdAt: -1 });
  res.render('profile', { urls });
});

// Generate new dummy link
app.post('/generate', async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
});

// Edit actual link for dummy link
app.patch('/edit/:dummylink', async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
});

// Redirect dummy link to actual link
app.get('/:dummylink', async (req, res) => {
  try {
    const url = await Url.findOne({ dummylink: req.params.dummylink });
    if (!url) {
      return res.status(404).send('Link not found');
    }
    if (!url.actuallink) {
      return res.status(400).send('something went wrong');//actual link not set yet
    }
    res.redirect(url.actuallink);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
