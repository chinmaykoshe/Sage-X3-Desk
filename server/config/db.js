import mongoose from 'mongoose';

let mongoUnavailableUntil = 0;

const connectDB = async () => {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sage_x3_desk';
  const conn = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 2000,
    connectTimeoutMS: 2000,
  });
  mongoUnavailableUntil = 0;
  console.log(`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
  return conn;
};

export function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

export function markMongoUnavailable(ttlMs = 60000) {
  mongoUnavailableUntil = Date.now() + ttlMs;
}

export function shouldSkipMongoRetry() {
  return Date.now() < mongoUnavailableUntil;
}

export default connectDB;
