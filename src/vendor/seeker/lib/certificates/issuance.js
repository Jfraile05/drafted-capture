/**
 * Certificate issuance — idempotent writes to certificates/{certId}.
 *
 * Called from useTaskSubmission after badge + XP updates complete.
 * Safe to call on every task submission: evaluates current tier eligibility,
 * filters out already-issued certs, writes only the new ones.
 *
 * Data model:
 *   certificates/{certId} = {
 *     cert_id: uuid,
 *     credential_code: 'DL-RLHF-2026-A7F3B2',  // public-facing
 *     recipient_email: 'student@usc.edu',
 *     recipient_name: 'Jane Doe',
 *     recipient_university: 'University of Southern California',
 *     tier_id: 'specialist' | 'foundations' | 'advanced' | 'expert',
 *     tier_number: 1-4,
 *     badge_type: 'RLHF Evaluator' | null,  // only for specialist certs
 *     credential_name: 'Certified RLHF Evaluator',
 *     evidence_statement: '...',
 *     skills: ['RLHF', 'Preference Ranking', ...],
 *     issued_at: ISO string,
 *     stats: { totalTasks, avgQuality, novaLevel, goldBadges, silverCount, taskCount },
 *     revoked: false,
 *   }
 *
 *   drafted-accounts/{email}.certificates = [
 *     { cert_id, tier_id, credential_name, credential_code, issued_at },
 *     ...
 *   ]
 */

import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { levelForXp } from '../nova/levels';
import {
  buildCredentialCode,
  buildEvidenceStatement,
  evaluateEarnedTiers,
  resolveTierDefinition,
} from './tiers';

const LOG = '[Certificates]';

/**
 * Build the unique identity key for a cert, used to dedupe against
 * already-issued certs. Specialist certs are unique per badge_type.
 */
function certIdentityKey(earned) {
  if (earned.id === 'specialist') return `specialist:${earned.badge_type}`;
  return earned.id;
}

/**
 * Read already-issued certs from drafted-accounts/{email}.
 */
async function getIssuedCertKeys(accountDocRef) {
  const snap = await getDoc(accountDocRef);
  if (!snap.exists()) return new Set();
  const existing = snap.data().certificates || [];
  return new Set(
    existing.map((c) => (c.tier_id === 'specialist' ? `specialist:${c.badge_type}` : c.tier_id)),
  );
}

/**
 * Issue any newly-earned certificates for a user.
 *
 * Called after every task submission. No-op if nothing new is earned.
 *
 * @param {object} args
 * @param {string} args.userEmail - lowercased email
 * @param {object} args.accountData - drafted-accounts doc data
 * @param {object} args.annotatorProfile - annotator_profiles/{email} data (post-update)
 * @param {number} args.totalXp - Nova total_xp (0 if no agent)
 * @returns {Promise<Array>} — certs newly issued in this call
 */
export async function issueEarnedCertificates({
  userEmail,
  accountData,
  annotatorProfile,
  totalXp = 0,
}) {
  if (!userEmail || !annotatorProfile) return [];

  const accountDocRef = doc(db, 'drafted-accounts', userEmail);

  // Determine which certs the user currently qualifies for
  const earned = evaluateEarnedTiers({ annotatorProfile, totalXp });
  if (earned.length === 0) return [];

  // Filter out ones already issued
  const alreadyIssued = await getIssuedCertKeys(accountDocRef);
  const toIssue = earned.filter((e) => !alreadyIssued.has(certIdentityKey(e)));
  if (toIssue.length === 0) return [];

  const now = new Date().toISOString();
  const totalTasks = annotatorProfile.total_tasks_completed || 0;
  const avgQuality = annotatorProfile.quality?.overall_avg || 0;
  const badges = annotatorProfile.badges || [];
  const goldBadges = badges.filter((b) => b.level === 'gold').length;
  const silverCount = badges.filter((b) => b.level === 'silver' || b.level === 'gold').length;
  const novaLevel = levelForXp(totalXp).level;

  const fullName =
    accountData?.fullName ||
    [accountData?.firstName, accountData?.lastName].filter(Boolean).join(' ').trim() ||
    accountData?.displayName ||
    'Drafted Labs Contributor';

  const university = accountData?.university || accountData?.school || '';

  const issued = [];
  for (const e of toIssue) {
    try {
      const certId = crypto.randomUUID();
      const def = resolveTierDefinition({ id: e.id, badge_type: e.badge_type });
      if (!def) continue;

      // Task count context for evidence statement
      const CU_TIER_IDS = new Set([
        'computer_use_first_task',
        'computer_use_silver',
        'computer_use_gold',
      ]);
      const taskCount = CU_TIER_IDS.has(e.id)
        ? annotatorProfile?.tasks_by_type?.computer_use_trajectory || 0
        : e.id === 'specialist' && e.badge_type
          ? badgeTaskCount(annotatorProfile, e.badge_type)
          : totalTasks;

      // For CU certs, use the CU-specific quality average
      const certAvgQuality = CU_TIER_IDS.has(e.id)
        ? annotatorProfile?.quality?.by_type?.computer_use_trajectory || avgQuality
        : avgQuality;

      const stats = {
        totalTasks,
        avgQuality: certAvgQuality,
        novaLevel,
        goldBadges,
        silverCount,
        taskCount,
      };

      const credentialCode = buildCredentialCode(e.id, certId, e.badge_type);
      const evidenceStatement = buildEvidenceStatement({
        id: e.id,
        badge_type: e.badge_type,
        stats,
      });

      const certDoc = {
        cert_id: certId,
        credential_code: credentialCode,
        recipient_email: userEmail,
        recipient_name: fullName,
        recipient_university: university,
        tier_id: e.id,
        tier_number: e.tier,
        badge_type: e.badge_type || null,
        credential_name: def.name,
        short_name: def.short_name,
        tagline: def.tagline,
        accent: def.accent,
        evidence_statement: evidenceStatement,
        skills: def.skills || [],
        issued_at: now,
        issuer: 'Drafted Labs, Inc.',
        issuer_entity: 'A Delaware C-Corporation',
        stats,
        revoked: false,
        version: 1,
      };

      await setDoc(doc(db, 'certificates', certId), certDoc);

      issued.push(certDoc);
      console.log(`${LOG} Issued`, {
        certId,
        code: credentialCode,
        tier: e.tier,
        recipient: userEmail,
      });
    } catch (err) {
      console.error(`${LOG} Failed to issue cert`, { tier: e, err });
      // Continue issuing other certs even if one fails
    }
  }

  // Update the index on drafted-accounts
  if (issued.length > 0) {
    try {
      const existingCerts = accountData?.certificates || [];
      const newIndex = [
        ...existingCerts,
        ...issued.map((c) => ({
          cert_id: c.cert_id,
          tier_id: c.tier_id,
          tier_number: c.tier_number,
          badge_type: c.badge_type,
          credential_name: c.credential_name,
          credential_code: c.credential_code,
          issued_at: c.issued_at,
        })),
      ];
      await setDoc(accountDocRef, { certificates: newIndex }, { merge: true });
    } catch (err) {
      console.error(`${LOG} Failed to update account cert index`, err);
    }
  }

  return issued;
}

/**
 * Pull task count for a specific badge_type from annotator_profile.
 */
function badgeTaskCount(annotatorProfile, badgeType) {
  const badges = annotatorProfile?.badges || [];
  const match = badges.find((b) => b.badge_type === badgeType);
  return match?.tasks_completed || 0;
}

/**
 * Fetch a single cert by its certId (for the verification page).
 */
export async function fetchCertificate(certId) {
  if (!certId) return null;
  const snap = await getDoc(doc(db, 'certificates', certId));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (data.revoked) return { ...data, revoked: true };
  return data;
}

/**
 * Fetch cert by credential_code (human-readable).
 * Used when students share "DL-RLHF-2026-A7F3B2" on LinkedIn.
 */
export async function fetchCertificateByCode(code) {
  if (!code) return null;
  const q = query(collection(db, 'certificates'), where('credential_code', '==', code));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docData = snap.docs[0].data();
  if (docData.revoked) return { ...docData, revoked: true };
  return docData;
}

/**
 * Fetch all certs for a user (their own cert locker).
 */
export async function fetchUserCertificates(userEmail) {
  if (!userEmail) return [];
  const accountSnap = await getDoc(doc(db, 'drafted-accounts', userEmail.toLowerCase()));
  if (!accountSnap.exists()) return [];
  const index = accountSnap.data().certificates || [];

  // Hydrate each one from the certificates collection to ensure freshness
  const hydrated = await Promise.all(
    index.map(async (entry) => {
      try {
        const full = await fetchCertificate(entry.cert_id);
        return full || entry;
      } catch {
        return entry;
      }
    }),
  );

  return hydrated.sort((a, b) => (b.issued_at || '').localeCompare(a.issued_at || ''));
}
