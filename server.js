/** Local server. On Vercel, api/index.js serves the same app instead. */
import app from './app.js';
import { aiEnabled } from './lib/ai.js';
import { fieldDataEnabled } from './lib/checks/field-data.js';

const PORT = process.env.PORT || 3000;

// Express 5 reports startup errors (e.g. port already in use) through this callback.
app.listen(PORT, (err) => {
  if (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(`\nPort ${PORT} is already in use, probably by another copy of this app.`);
      console.error('Close the other terminal running it, or start on another port:');
      console.error(process.platform === 'win32' ? `  set PORT=3001 && npm start\n` : `  PORT=3001 npm start\n`);
    } else {
      console.error('Could not start the server:', err.message);
    }
    process.exit(1);
  }
  console.log(`Website Health Check running at http://localhost:${PORT}`);
  if (fieldDataEnabled()) console.log('Real-visitor data (Chrome UX Report): enabled');
  if (aiEnabled()) console.log('Optional Claude AI summaries: enabled');
});
