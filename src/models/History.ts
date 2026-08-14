import mongoose, { Document, Schema } from 'mongoose';

export interface IHistory extends Document {
  subDepartment: mongoose.Types.ObjectId;

  dateTime: Date;

  activity:
    | 'Created'
    | 'Updated'
    | 'Added'
    | 'Uploaded'
    | 'Deleted'
    | 'Archived'
    | 'Approved'
    | 'Rejected';

  activityGroup:
    | 'Sub Department'
    | 'Team Member'
    | 'Document'
    | 'Master Data'
    | 'Budget'
    | 'Other';

  title: string;

  detail: string;

  performedBy: {
    name: string;
    role: string;
    avatarUrl?: string;
  };

  ip: string;
}

const historySchema = new Schema<IHistory>(
  {
    subDepartment: {
      type: Schema.Types.ObjectId,
      ref: 'SubDepartment',
      required: true,
      index: true,
    },

    dateTime: {
      type: Date,
      default: Date.now,
      index: true,
    },

    activity: {
      type: String,
      enum: [
        'Created',
        'Updated',
        'Added',
        'Uploaded',
        'Deleted',
        'Archived',
        'Approved',
        'Rejected',
      ],
      required: true,
    },

    activityGroup: {
      type: String,
      enum: [
        'Sub Department',
        'Team Member',
        'Document',
        'Master Data',
        'Budget',
        'Other',
      ],
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    detail: {
      type: String,
      default: '',
    },

    performedBy: {
      name: {
        type: String,
        required: true,
      },

      role: {
        type: String,
        default: '',
      },

      avatarUrl: {
        type: String,
        default: '',
      },
    },

    ip: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IHistory>(
  'History',
  historySchema
);