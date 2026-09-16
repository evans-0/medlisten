require('dotenv').config();
const connectDB = require('./config/db');
const createApp = require('./app');
const { warmup } = require('./utils/chat/ollamaChat');

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    const app = createApp();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    warmup(); // fire-and-forget — see ollamaChat.js
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
