const fs = require('fs');
const files = [
  'src/routes/superAdminRoutes.ts',
  'src/controllers/superAdminController.ts',
  'src/models/Package.ts',
  'src/models/Tenant.ts'
];
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  content = content.replace(/<<<<<<< Updated upstream\r?\n([\s\S]*?)=======\r?\n[\s\S]*?>>>>>>> Stashed changes\r?\n?/g, (match, p1) => p1);
  fs.writeFileSync(f, content, 'utf8');
});
