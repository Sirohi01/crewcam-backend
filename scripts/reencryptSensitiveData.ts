import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { decrypt, encrypt, isLegacyEncrypted, isUsingLegacyKey } from '../src/utils/encryption';
import { BankPayrollInfo } from '../src/models/BankPayrollInfo';
import { EmployeeAiSummary } from '../src/models/EmployeeAiSummary';
import { PlatformAiProvider } from '../src/models/PlatformAiProvider';
import { ResumeScreening } from '../src/models/ResumeScreening';
import { Integration } from '../src/models/Integration';
import { ProfileChangeRequest } from '../src/models/ProfileChangeRequest';

dotenv.config();

/** Moves every encrypted value off the old public fallback key onto ENCRYPTION_KEY.
 *
 * Before ENCRYPTION_KEY was required, values were encrypted with a key written in the
 * source code. src/utils/encryption.ts still *reads* them, but they stay effectively
 * unprotected until re-encrypted. This script decrypts each such value and encrypts it
 * again with the configured key. It works on the raw collections, so model save hooks
 * can't double-encrypt, and only touches values that are still on the legacy key —
 * safe to run more than once.
 *
 * Steps: set ENCRYPTION_KEY (32 characters) → back up the database → run without
 * --apply to see counts → run with --apply.
 * Usage: npx ts-node scripts/reencryptSensitiveData.ts [--apply]
 */
const TARGETS: Array<{ model: mongoose.Model<any>; fields: string[]; mapField?: string }> = [
  { model: BankPayrollInfo, fields: ['accountNumber', 'panNumber', 'aadhaarNumber'] },
  { model: EmployeeAiSummary, fields: ['summaryText'] },
  { model: PlatformAiProvider, fields: ['apiKey'] },
  { model: ResumeScreening, fields: ['extractedText'] },
  { model: ProfileChangeRequest, fields: ['proposedEncrypted'] },
  { model: Integration, fields: [], mapField: 'credentials' },
];

const needsRotation = (v: unknown): v is string => typeof v === 'string' && v.split(':').length === 3 && isLegacyEncrypted(v);

async function main() {
  const apply = process.argv.includes('--apply');
  if (isUsingLegacyKey()) {
    console.error('ENCRYPTION_KEY is not set. Set a 32-character key first; there is nothing to rotate to.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI as string);

  for (const { model, fields, mapField } of TARGETS) {
    const collection = model.collection;
    let docs = 0;
    let values = 0;
    for await (const doc of collection.find({})) {
      const set: Record<string, string> = {};
      for (const field of fields) {
        if (needsRotation(doc[field])) set[field] = encrypt(decrypt(doc[field]));
      }
      if (mapField && doc[mapField] && typeof doc[mapField] === 'object') {
        for (const [key, value] of Object.entries(doc[mapField])) {
          if (needsRotation(value)) set[`${mapField}.${key}`] = encrypt(decrypt(value));
        }
      }
      const count = Object.keys(set).length;
      if (!count) continue;
      docs++;
      values += count;
      if (apply) await collection.updateOne({ _id: doc._id }, { $set: set });
    }
    console.log(`${collection.collectionName}: ${values} value(s) in ${docs} document(s) ${apply ? 're-encrypted' : 'to re-encrypt'}`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
