// Mongoose setup for MongoDB
const mongoose = require('mongoose');
require('dotenv').config();

const DATABASE_URL = process.env.MONGODB_URI || 'mongodb://localhost:27017/modulevault';

const connectDB = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(DATABASE_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected successfully');

    // Ensure required collections exist by creating a dummy document if missing
    const Executable = mongoose.models.Executable || require('../models/Executable')();
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    if (!collectionNames.includes('executables')) {
      // Create a dummy document and remove it to ensure collection is created
      const dummy = new Executable({
        name: 'dummy',
        version: '0.0.0',
        repositoryManager: 'npm',
        fileName: 'dummy',
        fileSize: 0
      });
      await dummy.save();
      await Executable.deleteOne({ _id: dummy._id });
      console.log('Created missing collection: executables');
    }
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

module.exports = { connectDB, mongoose };
