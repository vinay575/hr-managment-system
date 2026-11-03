import { testConnection } from './db.js';
import { createApp } from './app.js';
const PORT = Number(process.env.PORT) || 4001;
const app = createApp();

let retries = 5;
while (retries > 0) {
  try {
    const info = await testConnection();
    console.log(`✓ Database connected — TiDB ${info.version}`);
    app.listen(PORT, () => {
      console.log(`✓ Aurora HR API running at http://localhost:${PORT}`);
    });
    break;
  } catch (err) {
    retries -= 1;
    console.error(`✗ Database connection attempt failed (${err.message}). Retries left: ${retries}`);
    if (retries === 0) {
      console.error('✗ Exhausted database connection attempts. Exiting.');
      process.exit(1);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
