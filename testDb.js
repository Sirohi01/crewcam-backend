const mongoose = require('mongoose');
const { Schema } = mongoose;

const uri = "mongodb://localhost:27017/newhrcrm"; // or whatever the db is
mongoose.connect(uri)
  .then(async () => {
    const db = mongoose.connection.db;
    const forms = await db.collection('inductionforms').find({}).sort({createdAt: -1}).limit(5).toArray();
    console.log("Latest forms:");
    forms.forEach(f => {
      console.log(`ID: ${f._id}, candidate: ${f.candidateId}, uniqueId: ${f.uniqueId}`);
    });
    process.exit(0);
  })
  .catch(console.error);
