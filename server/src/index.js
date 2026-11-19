import { testConnection } from './db.js';
import { createApp } from './app.js';
import { runDocumentReminders } from './services/document-notifications.js';
import { publishDueAnnouncements } from './services/announcements.js';
const PORT = Number(process.env.PORT) || 4001;
const app = createApp();

function scheduleDocumentReminders() {
  const run = () => runDocumentReminders().catch((err) => console.error('Document reminder job failed:', err.message));
  // Give the server time to finish booting, then run twice a day.
  setTimeout(run, 30_000).unref?.();
  setInterval(run, 12 * 60 * 60 * 1000).unref?.();
}

function scheduleAnnouncementPublisher() {
  const run = () => publishDueAnnouncements().catch((err) => console.error('Announcement publish job failed:', err.message));
  // Scheduled notices normally publish on the next request; this keeps them on time.
  setTimeout(run, 15_000).unref?.();
  setInterval(run, 60_000).unref?.();
}

let retries = 5;
while (retries > 0) {
  try {
    const info = await testConnection();
    console.log(`✓ Database connected — TiDB ${info.version}`);
    app.listen(PORT, () => {
      console.log(`✓ Aurora HR API running at http://localhost:${PORT}`);
      scheduleDocumentReminders();
      scheduleAnnouncementPublisher();
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
