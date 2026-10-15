require('dotenv').config({ path: '.env.local' });
fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + process.env.GOOGLE_GENERATIVE_AI_API_KEY)
  .then(r => r.json())
  .then(data => {
    console.log(data.models.map(m => m.name));
  });
