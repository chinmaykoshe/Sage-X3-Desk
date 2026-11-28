import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema(
  {
    clientId: { type: String, unique: true, index: true },
    companyName: { type: String, required: true, trim: true, index: true },
    aliases: [{ type: String, trim: true }],
    companyDescription: { type: String, default: '' },
    primaryContactPerson: { type: String, required: true, trim: true },
    contactEmail: { type: String, required: true, trim: true, lowercase: true },
    contactNumber: { type: String, default: '' },
    address: { type: String, default: '' },
    accountStatus: {
      type: String,
      enum: ['Active', 'Onboarding', 'On Hold', 'Inactive'],
      default: 'Active',
      index: true,
    },
    dateAdded: { type: Date, default: Date.now },
    internalNotes: { type: String, default: '' },
    // Sage X3 specific
    sageX3Version: { type: String, default: 'V12 P33' },
    clientFolderCode: { type: String, required: true, trim: true, uppercase: true },
    pilotFolderCode: { type: String, default: '', trim: true, uppercase: true },
    productionFolderCode: { type: String, default: '', trim: true, uppercase: true },
    hostingInformation: { type: String, default: '' },
    integrationDetails: { type: String, default: '' },
    supportAgreementInfo: { type: String, default: '' },
    slaResponseHours: { type: Number, default: 24 },
    accountManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const Client = mongoose.model('Client', clientSchema);
export default Client;
