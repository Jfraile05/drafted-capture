import type { AvailableWorkflow } from '../shared/workflows';
import settings from './settings.json';

export const DEMO = settings;

export const DEMO_WORKFLOWS: AvailableWorkflow[] = [
  {
    id: 'flight-booking',
    name: 'Flight Booking',
    hourly_rate_cents: 100,
    annotation_enabled: false,
    annotation_rate_cents: 0,
    project_id: 'synthetic-flights',
    org_id: DEMO.orgId,
  },
  {
    id: 'online-shopping',
    name: 'Online Shopping',
    hourly_rate_cents: 100,
    annotation_enabled: true,
    annotation_rate_cents: 50,
    project_id: 'synthetic-shopping',
    org_id: DEMO.orgId,
  },
  {
    id: 'productivity',
    name: 'Productivity',
    hourly_rate_cents: 100,
    annotation_enabled: false,
    annotation_rate_cents: 0,
    project_id: 'synthetic-productivity',
    org_id: DEMO.orgId,
  },
];
