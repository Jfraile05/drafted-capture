import type { EnrichmentMap, SubmitResult } from '../../src/shared/submitToDrafted';
import type { Session } from '../../src/shared/types';

export const submission = {
  user: { uid: 'student' } as { uid: string } | null,
  upload: async (_session: Session, _enrich?: EnrichmentMap): Promise<SubmitResult> => ({
    taskId: 'server-receipt',
    qualityScore: 80,
    badgeEarned: false,
    badgeLevel: null,
  }),
  enrich: async (_session: Session, _id: string, _enrich: EnrichmentMap): Promise<void> => {},
  owner: async (_session: Session): Promise<string | null> => null,
};

export async function getCurrentUser() {
  return submission.user;
}

export async function submitSessionToDrafted(session: Session, enrich?: EnrichmentMap) {
  return submission.upload(session, enrich);
}

export async function enrichSubmittedSession(session: Session, id: string, enrich: EnrichmentMap) {
  return submission.enrich(session, id, enrich);
}

export async function submittedSessionOwner(session: Session) {
  return submission.owner(session);
}
