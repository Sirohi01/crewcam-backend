const mongoose = require('mongoose');

const uri = "mongodb://tejodhar629_db_user:DatabaseDbUser@ac-cof2w53-shard-00-00.c9plbjn.mongodb.net:27017,ac-cof2w53-shard-00-01.c9plbjn.mongodb.net:27017,ac-cof2w53-shard-00-02.c9plbjn.mongodb.net:27017/hrcrm?ssl=true&replicaSet=atlas-diy444-shard-0&authSource=admin&appName=Cluster0";

async function check() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  
  const candidates = await db.collection('candidates').find({}).toArray();
  console.log("=== CANDIDATES ===");
  for (const c of candidates) {
    console.log({
      _id: c._id,
      name: `${c.firstName} ${c.lastName}`,
      email: c.email,
      phone: c.phone,
      applicationDetails: c.applicationDetails
    });
  }

  const offers = await db.collection('offerletters').find({}).toArray();
  console.log("=== OFFERS ===");
  for (const o of offers) {
    console.log({
      _id: o._id,
      candidateId: o.candidateId,
      candidateName: o.candidateName,
      annualCTC: o.annualCTC,
      monthlyCTC: o.monthlyCTC
    });
  }

  const breakups = await db.collection('ctcbreakups').find({}).toArray();
  console.log("=== CTC BREAKUPS ===");
  for (const b of breakups) {
    console.log({
      _id: b._id,
      candidateId: b.candidateId,
      candidateName: b.candidateName,
      annualCTC: b.annualCTC
    });
  }

  const approvals = await db.collection('selectionapprovals').find({}).toArray();
  console.log("=== SELECTION APPROVALS ===");
  for (const a of approvals) {
    console.log({
      _id: a._id,
      candidateId: a.candidateId,
      candidateName: a.candidateName,
      proposedAnnualCTC: a.proposedAnnualCTC,
      proposedMonthlyCTC: a.proposedMonthlyCTC
    });
  }

  await mongoose.disconnect();
}

check().catch(console.error);
