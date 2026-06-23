import mongoose from 'mongoose';
import { Course } from '../models/Course';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import dotenv from 'dotenv';
dotenv.config();

const runSeed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/crucam');
    
    const tenant = await Tenant.findOne();
    if(!tenant) {
      console.log("No tenant found");
      process.exit(1);
    }
    const adminOrHr = await User.findOne({}, null, { bypassTenantIsolation: true });

    if(!tenant || !adminOrHr) {
      console.log("No tenant or Admin/HR user found");
      process.exit(1);
    }

    const course = new Course({
      tenantId: tenant._id,
      title: "Generative AI Complete Course",
      description: "Learn Generative AI, Large Language Models, Prompt Engineering, LangChain, and RAG in this comprehensive course.",
      createdBy: adminOrHr._id,
      modules: [
        {
          title: "Introduction to Generative AI & Roadmap",
          materialsUrl: "https://www.youtube.com/watch?v=G2fqAlgmoPo",
          duration: 15
        },
        {
          title: "Prompt Engineering Basics",
          materialsUrl: "https://www.youtube.com/watch?v=jC4v5AS4ART",
          duration: 25
        },
        {
          title: "Understanding Large Language Models (LLMs)",
          materialsUrl: "https://www.youtube.com/watch?v=zjkBMFhNj_g",
          duration: 30
        },
        {
          title: "Introduction to LangChain Framework",
          materialsUrl: "https://www.youtube.com/watch?v=nAmC7SoVLd8",
          duration: 40
        },
        {
          title: "Retrieval Augmented Generation (RAG)",
          materialsUrl: "https://www.youtube.com/watch?v=T-D1OfcDW1M",
          duration: 35
        }
      ]
    });

    await course.save();
    console.log("Successfully seeded Generative AI Course!");
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

runSeed();
