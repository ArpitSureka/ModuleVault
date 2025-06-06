// Mongoose setup for MongoDB
import mongoose from 'mongoose';
import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    const executablePath = path.join(__dirname, '../models/Executable.js');
    const getExecutableModel = (await import(executablePath)).default;
    const Executable = mongoose.models.Executable || getExecutableModel();
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

export { connectDB, mongoose };
