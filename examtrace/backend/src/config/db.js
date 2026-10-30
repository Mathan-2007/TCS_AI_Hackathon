const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

module.exports = async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/examtrace';

  try {
    await mongoose.connect(uri);
    console.log(`MongoDB connected to ${uri}`);
    return;
  } catch (error) {
    if (process.env.MONGO_URI) {
      throw error;
    }

    const memoryServer = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
    const dbUri = memoryServer.getUri();
    await mongoose.connect(dbUri);
    console.log('MongoDB not available locally; connected via in-memory demo database');
  }
}
