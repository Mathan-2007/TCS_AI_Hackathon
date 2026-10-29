const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

module.exports = async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (uri) {
    await mongoose.connect(uri);
    console.log('MongoDB connected to configured URI');
    return;
  }

  const memoryServer = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
  const dbUri = memoryServer.getUri();
  await mongoose.connect(dbUri);
  console.log('MongoDB connected via in-memory demo database');
}
