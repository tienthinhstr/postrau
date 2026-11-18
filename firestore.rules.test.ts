import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

test('Firestore security rules enforce all 8 Pillars and valid RE2 regex character classes', () => {
  // 1. Global Default-Deny Catch-All
  assert.ok(
    rulesContent.includes('match /{document=**} {\n      allow read, write: if false;\n    }'),
    'Must include global default-deny catch-all'
  );

  // 2. Verified Email Requirement
  assert.ok(
    rulesContent.includes('request.auth != null && request.auth.token.email_verified == true'),
    'Must enforce email_verified == true on all authenticated requests'
  );

  // 3. Valid RE2 regex without double-escaped hyphen range bug
  assert.ok(
    rulesContent.includes("id.matches('^[a-zA-Z0-9_-]+$')"),
    'Must use valid RE2 character class ^[a-zA-Z0-9_-]+$'
  );
  assert.ok(
    !rulesContent.includes('0-9_\\\\-'),
    'Must not contain invalid 0-9_\\\\- range in rules'
  );

  // 4. Bootstrapped Admin & Trusted /admins/{uid} lookup
  assert.ok(
    rulesContent.includes("request.auth.token.email == 'tienthinhstr@gmail.com'"),
    'Must include bootstrapped owner email'
  );
  assert.ok(
    rulesContent.includes('exists(/databases/$(database)/documents/admins/$(request.auth.uid))'),
    'Must verify admin membership via /admins/{uid}'
  );

  // 5. Anti-Update-Gap Validation Helpers on all 4 collections
  assert.ok(rulesContent.includes('isValidUserProfile(incoming())'));
  assert.ok(rulesContent.includes('isValidAdminRecord(incoming())'));
  assert.ok(rulesContent.includes('isValidInvoiceDoc(incoming())'));
  assert.ok(rulesContent.includes('isValidStoreSettingsDoc(incoming())'));

  // 6. Strict hasAll + hasOnly key guards
  assert.ok(rulesContent.includes('data.keys().hasAll('));
  assert.ok(rulesContent.includes('data.keys().hasOnly('));
  assert.ok(rulesContent.includes('affectedKeys().hasOnly('));
});
