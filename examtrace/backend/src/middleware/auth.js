const jwt = require('jsonwebtoken');

const secret = () => process.env.JWT_SECRET || 'dev-secret-change-me';

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Sign in to continue' });
  try {
    req.user = jwt.verify(token, secret());
    next();
  } catch {
    res.status(401).json({ message: 'Your session expired. Sign in again.' });
  }
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ message: 'You do not have access to this action' });

const signToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role, name: user.name, studentId: user.studentId },
    secret(),
    { expiresIn: '7d' }
  );

module.exports = { auth, requireRole, signToken };
