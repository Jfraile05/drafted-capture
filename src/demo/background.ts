import '../background/index';
import { checkInputIdle } from '../background/idle';
import { enforceSessionCap } from '../background/session';
import { MAX_SESSION_MS } from '../shared/constants';
import { getLiveSession, setLiveSession, withLiveLock } from '../shared/storage/live';

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!['synthetic-test-idle', 'synthetic-test-cap'].includes(alarm.name)) return;
  void (async () => {
    await withLiveLock(async () => {
      const live = await getLiveSession();
      if (!live || live.state !== 'capturing')
        throw new Error('Start or resume a synthetic task first.');
      if (alarm.name === 'synthetic-test-idle') live.last_activity_at = Date.now() - 180001;
      else {
        live.started_at = Date.now() - MAX_SESSION_MS;
        live.last_activity_at = Date.now();
      }
      await setLiveSession(live);
    });
    if (alarm.name === 'synthetic-test-idle') await checkInputIdle();
    else await enforceSessionCap();
  })().catch((error) => console.warn('[synthetic control]', error));
});
