import { buildApp } from './app.ts';
import { config, isProd } from './config.ts';
import { runRetention } from './retention.ts';
import { seedDemo } from './tools/seed.ts';

const app = buildApp();
if (!isProd && process.env.SEED !== '0') await seedDemo(app.db);

setInterval(() => {
  try {
    runRetention(app.db);
  } catch (e) {
    app.log.error(e, 'retention sweep failed');
  }
}, 24 * 60 * 60 * 1000).unref();

await app.listen({ port: config.port, host: config.host });
