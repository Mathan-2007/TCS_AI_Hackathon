const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { auth, signToken } = require('../middleware/auth');
const wrap = require('../utils/asyncHandler');

const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, studentId: u.studentId });

// Self-registration creates student accounts only. Admin accounts are created with `npm run seed`.
router.post('/register', wrap(async (req, res) => {
  const { name, email, password, studentId } = req.body;
  if (!name || !email || !password || !studentId) return res.status(400).json({ message: 'Name, email, student ID and password are required' });
  if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
  if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ message: 'An account with this email already exists' });
  const user = await User.create({ name, email, studentId: studentId.trim(), role: 'student', passwordHash: await bcrypt.hash(password, 10) });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

router.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  const user = email && (await User.findOne({ email: email.toLowerCase() }));
  if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) {
    return res.status(401).json({ message: 'Email or password is incorrect' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
}));

router.get('/me', auth, wrap(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(401).json({ message: 'Account no longer exists' });
  res.json(publicUser(user));
}));

module.exports = router;
