const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config();

const User = require('./models/User');
const Url = require('./models/Url');
const app = express();

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI })
}));

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const requireLogin = async (req, res, next) => {
  if (!req.session.userId) return res.redirect('/login');
  const user = await User.findById(req.session.userId);
  if (!user || !user.verified) return res.send('Email not verified');
  req.user = user;
  next();
};

app.get('/register', (req, res) => res.render('register'));
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  const hash = await bcrypt.hash(password, 12);
  const verificationToken = crypto.randomBytes(20).toString('hex');

  const user = await new User({ email, password: hash, verificationToken }).save();
  const link = `${process.env.BASE_URL}/verify/${verificationToken}`;
  await transporter.sendMail({
    to: email,
    subject: 'Verify your email',
    html: `<a href="${link}">Click to verify</a>`
  });

  res.send('Check your email to verify.');
});

app.get('/verify/:token', async (req, res) => {
  const user = await User.findOne({ verificationToken: req.params.token });
  if (!user) return res.send('Invalid token.');
  user.verified = true;
  user.verificationToken = null;
  await user.save();
  res.send('Email verified. You can <a href="/login">login now</a>.');
});

app.get('/', (req, res) => res.redirect('login'));

app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !await bcrypt.compare(password, user.password)) return res.send('Invalid login');
  if (!user.verified) return res.send('Please verify your email first.');
  req.session.userId = user._id;
  res.redirect('/profile');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Password Reset
app.get('/forgot', (req, res) => res.render('forgot'));
app.post('/forgot', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.send('Email not found');
  const token = crypto.randomBytes(20).toString('hex');
  user.verificationToken = token;
  await user.save();
  const link = `${process.env.BASE_URL}/reset/${token}`;
  await transporter.sendMail({
    to: email,
    subject: 'Password Reset',
    html: `<a href="${link}">Click here to reset your password</a>`
  });
  res.send('Password reset link sent to email');
});

app.get('/reset/:token', async (req, res) => {
  const user = await User.findOne({ verificationToken: req.params.token });
  if (!user) return res.send('Invalid or expired token');
  res.render('reset', { token: req.params.token });
});

app.post('/reset/:token', async (req, res) => {
  const user = await User.findOne({ verificationToken: req.params.token });
  if (!user) return res.send('Invalid or expired token');
  const hash = await bcrypt.hash(req.body.password, 12);
  user.password = hash;
  user.verificationToken = null;
  await user.save();
  res.send('Password updated. You can <a href="/login">login</a> now.');
});

// Profile
app.get('/profile', requireLogin, async (req, res) => {
  const urls = await Url.find({ owner: req.user._id });
  res.render('profile', { urls, user: req.user });
});

app.get('/editprofile', requireLogin, (req, res) => {
  res.render('editprofile');
});

app.post('/editprofile', requireLogin, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = req.user;
  const match = await bcrypt.compare(oldPassword, user.password);
  if (!match) return res.send('Old password incorrect');
  user.password = await bcrypt.hash(newPassword, 12);
  await user.save();
  res.send('Password updated successfully');
});

// Dummy Link Generator
const generateDummyLink = async () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let shortStr, exists = true;
  while (exists) {
    shortStr = [...Array(6)].map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
    exists = await Url.findOne({ dummylink: shortStr });
  }
  return shortStr;
};

app.post('/generate', requireLogin, async (req, res) => {
  const dummylink = await generateDummyLink();
  const url = new Url({ dummylink, urlname: 'Dummy Link', owner: req.user._id });
  await url.save();
  req.user.urls.push(url);
  await req.user.save();
  res.status(201).send();
});

app.patch('/edit/:dummylink', requireLogin, async (req, res) => {
  const url = await Url.findOne({ dummylink: req.params.dummylink, owner: req.user._id });
  if (!url) return res.sendStatus(404);
  url.actuallink = req.body.actuallink;
  await url.save();
  res.sendStatus(200);
});

// Delete dummy URL
app.delete('/delete/:dummylink', requireLogin, async (req, res) => {
  try {
    const dummylink = req.params.dummylink;
    const url = await Url.findOneAndDelete({ dummylink, owner: req.user._id });
    if (!url) return res.status(404).send('Dummy URL not found or not owned by you.');

    req.user.urls = req.user.urls.filter(u => u.toString() !== url._id.toString());
    await req.user.save();

    res.send('Dummy URL deleted successfully.');
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error.');
  }
});

app.get('/:dummylink', async (req, res) => {
  const url = await Url.findOne({ dummylink: req.params.dummylink });
  if (!url || !url.actuallink) return res.status(404).send('Link not found');
  res.redirect(url.actuallink);
});

app.listen(process.env.PORT, () => console.log(`http://localhost:${process.env.PORT}`));
