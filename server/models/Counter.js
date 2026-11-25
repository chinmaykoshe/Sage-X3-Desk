import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model('Counter', counterSchema);

/**
 * Generates an atomic sequential formatted ID like TKT-1001.
 */
export async function getNextSequence(key, prefix, startAt = 1) {
  const doc = await Counter.findOneAndUpdate(
    { _id: key },
    [
      {
        $set: {
          seq: {
            $add: [{ $ifNull: ['$seq', startAt - 1] }, 1],
          },
        },
      },
    ],
    { new: true, upsert: true }
  );
  const padded = String(doc.seq).padStart(startAt >= 1000 ? 4 : 3, '0');
  return `${prefix}-${padded}`;
}

export default Counter;
