import { EXTENSION_VERSION } from '../shared/constants';
import type { Session, Step } from '../shared/types';
import { classifyUrl, tagSegment } from '../shared/urlCategories';
import { workflowSnapshot } from '../shared/workflows';
import { DEMO, DEMO_WORKFLOWS } from './config';

export function fixtureSessions(now: number): Session[] {
  const hosts = ['flights.localhost', 'shop.localhost', 'work.localhost'];
  const labels = ['Compare flights to Boston', 'Compare keyboard prices', 'Plan client onboarding'];
  return DEMO_WORKFLOWS.map((workflow, n) => {
    const started = now - (3 - n) * 7200000;
    const url = `http://${hosts[n]}:${DEMO.port}/`;
    const steps: Step[] = [
      'Open the workspace',
      'Search available options',
      'Compare the results',
      'Save the selected option',
    ].map((label, i) => ({
      index: i,
      timestamp: started + i * 600000,
      duration_to_next: i === 3 ? null : 600000,
      action:
        i === 0
          ? { type: 'navigate', url }
          : i === 1
            ? { type: 'type', text: n === 1 ? 'wireless keyboard' : 'Sample task' }
            : { type: 'click', coordinate: [220, 220] },
      screenshot: {
        hash: `synthetic-frame-${n}-${i}`,
        width: 960,
        height: 600,
        dpr: 1,
        size: 0,
        timestamp: started + i * 600000,
      },
      dom: null,
      origin: { tab_id: n + 1, frame_id: 0, url, title: label, site: classifyUrl(url) },
      annotation: null,
    }));
    return {
      id: `synthetic-example-${workflow.id}`,
      source: 'human',
      started_at: started,
      ended_at: started + 1800000,
      pauses: [],
      intent: labels[n],
      steps,
      segments: [
        tagSegment(
          {
            id: `synthetic-label-${n}`,
            start_index: 0,
            end_index: 3,
            label: labels[n],
            category: 'research',
            notes: 'Synthetic sample. Edit this label to test saved changes and receipt revisions.',
            created_at: new Date(now).toISOString(),
          },
          steps,
        ),
      ],
      environment: {
        display_width: 960,
        display_height: 600,
        device_pixel_ratio: 1,
        user_agent: 'Synthetic fixture',
        browser: 'Chrome',
        browser_version: 'test',
        os: 'test',
        locale: 'en-US',
        timezone: 'UTC',
      },
      outcome: {
        total_steps: 4,
        total_duration_ms: 1800000,
        tabs_touched: 1,
        domains_touched: [hosts[n]],
      },
      metadata: {
        extension_version: EXTENSION_VERSION,
        owner_uid: DEMO.uid,
        drafted_project_id: workflow.project_id,
        drafted_org_id: DEMO.orgId,
        created_at: new Date(now).toISOString(),
        workflow: workflowSnapshot(workflow, n === 1),
      },
      sync: { revision: 1, synced_revision: 0, attempts: 0, retry_at: 0 },
    };
  });
}

export function fixtureImage(session: Session, step: Step): Blob {
  // The strings below are fixed fixture labels, never captured page content.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600"><rect width="960" height="600" fill="#111511"/><text x="48" y="65" fill="#f4f5ed" font-family="sans-serif" font-size="32">sidekick. / Synthetic workspace</text><text x="48" y="125" fill="#abb5aa" font-family="sans-serif" font-size="24">${session.intent}</text><rect x="48" y="165" width="864" height="340" rx="18" fill="#202720"/><text x="80" y="220" fill="#c5e5aa" font-family="sans-serif" font-size="23">${step.origin.title}</text><text x="80" y="280" fill="white" font-family="sans-serif" font-size="20">Option A: $49.00</text><text x="80" y="330" fill="white" font-family="sans-serif" font-size="20">Option B: $59.00</text><rect x="80" y="380" width="250" height="60" rx="8" fill="#c5e5aa"/><text x="105" y="418" font-family="sans-serif" font-size="20">${step.index === 3 ? 'Saved to shortlist' : 'Compare options'}</text><text x="48" y="555" fill="#abb5aa" font-family="sans-serif" font-size="18">Sample frame ${step.index + 1} of 4. No real student data.</text></svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
}
