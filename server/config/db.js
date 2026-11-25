import mongoose from 'mongoose';

const connectDB = async () => {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sage_x3_desk';
  const conn = await mongoose.connect(uri);
  console.log(`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
  return conn;
};

export default connectDB;
