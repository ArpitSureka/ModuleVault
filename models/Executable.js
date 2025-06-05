// Mongoose Executable schema for MongoDB
const { mongoose } = require('../config/database');

const ExecutableSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: 'No description available' },
  tags: { type: [String], default: [] },
  downloads: { type: Number, default: 0, min: 0 },
  score: { type: Number, min: 0, max: 5, default: null },
  version: { type: String, required: true },
  securityRating: { type: Number, min: 0, max: 10, default: null },
  repositoryManager: { type: String, enum: ['npm', 'pip'], required: true },
  fileName: { type: String, required: true },
  fileSize: { type: Number, min: 0, default: 0 },
}, { timestamps: true });

const Executable = mongoose.models.Executable || mongoose.model('Executable', ExecutableSchema);

module.exports = () => Executable;
