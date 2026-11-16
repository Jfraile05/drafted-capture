import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isPermissionDenied } from '../src/shared/submitErrors';

describe('isPermissionDenied', () => {
  it('spots the Firestore rules error', () => {
    assert.equal(
      isPermissionDenied(
        'FirebaseError: [code=permission-denied]: Missing or insufficient permissions.',
      ),
      true,
    );
  });

  it('ignores other failures', () => {
    assert.equal(isPermissionDenied('Failed to fetch'), false);
    assert.equal(isPermissionDenied(undefined), false);
  });
});
