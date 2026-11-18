# Security Specification — Vựa Rau Cải Thành Đạt POS (Firestore RBAC)

## 1. Data Invariants
1. **Default-Deny Catch-All**: Any path not explicitly matched under `/databases/{database}/documents` is unconditionally denied (`allow read, write: if false;`).
2. **Verified Authentication**: Every read and write requires an authenticated user with `request.auth != null && request.auth.token.email_verified == true`.
3. **PII & Profile Isolation (`/users/{userId}`)**:
   - Users cannot self-assign `role: 'admin'` during profile creation unless their verified email is the bootstrapped owner (`tienthinhstr@gmail.com`) or an `/admins/{userId}` record exists.
   - Non-admin users can only `get` their own `/users/{userId}` document (`request.auth.uid == userId`), while admins (`isAdmin()`) can `get` and `list` all staff profiles in `workspaceId == 'vua-rau-thanh-dat'` to manage roles.
   - Users cannot escalate their own `role` field on `update`. Only `isAdmin()` can modify `role`.
4. **Invoice Integrity (`/invoices/{invoiceId}`)**:
   - Every invoice must belong to `workspaceId == 'vua-rau-thanh-dat'`, have `createdByUid == request.auth.uid` on creation, `createdAt == request.time`, and `updatedAt == request.time`.
   - `items` is a bounded list (`1..50`) where `items[0] is map`, and `payments` is a bounded list (`0..50`).
   - Immutable fields (`id`, `workspaceId`, `createdByUid`, `createdAt`, `createdAtIso`) cannot be altered during updates.
   - Only `admin` or `cashier` roles (or the creator for `printedCount`) can update payment settlement fields (`paidAmount`, `remainingAmount`, `paymentStatus`, `paymentMethod`, `payments`, `updatedAt`), and only `admin` can delete invoices.

## 2. The "Dirty Dozen" Payloads (All Must Return `PERMISSION_DENIED`)
1. **Unauthenticated Write**: Creating an invoice with `request.auth == null`.
2. **Unverified Email Spoof**: Creating an admin user profile where `email == 'tienthinhstr@gmail.com'` but `email_verified == false`.
3. **Self-Assigned Admin Escalation**: A non-admin user (`staff@example.com`) creating `/users/{uid}` with `role: 'admin'`.
4. **Role Self-Update Escalation**: A `sales` user updating their own `/users/{uid}` document to change `role` from `'sales'` to `'admin'`.
5. **Shadow / Ghost Field Injection**: Updating an invoice with an undeclared field `isVerified: true` not in `hasOnly(...)`.
6. **Cross-User PII Read**: A non-admin user reading `/users/other-user-uid`.
7. **ID Poisoning Attack**: Creating `/invoices/{id}` with a 500-character ID or invalid characters (`../hack`).
8. **Creator Spoofing on Invoice**: Creating `/invoices/{id}` where `createdByUid` is set to another user's UID.
9. **Client Timestamp Forgery**: Creating `/invoices/{id}` where `createdAt` is a past timestamp instead of `request.time`.
10. **Unbounded Array Resource Exhaustion**: Creating `/invoices/{id}` with `items: []` (empty) or `items` exceeding 50 items.
11. **Unauthorized Payment Settlement by Sales Role**: A user with `role: 'sales'` attempting to modify `paidAmount` or `paymentStatus` on `/invoices/{id}`.
12. **Immutable Field Mutation**: Updating `createdAt` or `createdByUid` on an existing `/invoices/{id}` document.
