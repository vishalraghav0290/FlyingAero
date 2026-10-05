// Quick credential check: fetches a token and one small bounding box (1 credit).
// Prints counts and credit balance only, never the credentials themselves.
import { OpenSkyClient } from '../lib/server/opensky.js';
import { loadConfig } from '../lib/server/config.js';

const config = loadConfig();
const client = new OpenSkyClient(config.opensky);

console.log(`Credentials present: ${client.authenticated ? 'yes' : 'NO (anonymous mode)'}`);
try {
  const t0 = Date.now();
  await client._getToken();
  if (client.authenticated) console.log(`Token: ok (${Date.now() - t0} ms)`);
  // ~4.5Â° x 5Â° box over central Europe, under 25 sqÂ° = 1 credit
  const data = await client.getStates({ lamin: 47, lomin: 6, lamax: 51.5, lomax: 11 });
  const states = data?.states ?? [];
  const sample = states.find((s) => s[6] != null);
  console.log(`States in test box: ${states.length}, snapshot time ${new Date(data.time * 1000).toISOString()}`);
  console.log(`Fields per state: ${sample?.length ?? 0} (18 expected with extended=1)`);
  console.log(`States credits remaining: ${client.credits.states ?? 'unknown'}`);
} catch (err) {
  console.error(`FAILED: ${err.message}`);
  process.exitCode = 1;
}
