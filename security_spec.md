# Firestore Security Specification — Hubind Sterida Config Store

## 1. Data Invariants
1. **Singleton Workspace Config (`/config/workspace`)**:
   - Only `configId == 'workspace'` is valid under `/config/{configId}`.
   - Contains ONLY non-PII infrastructure IDs and app settings (`activeYear`, `spreadsheetId`, `spreadsheetName`, `spreadsheetUrl`, `driveFolderUrl`, `gasDeployUrl`, `academicYears`, `templates`, `updatedBy`, `updatedAt`).
   - Operational PKL data (students, NIK, phones, grades) is NEVER stored in Firestore — Google Spreadsheet is the sole SSOT.
   - `academicYears` list is strictly bounded to `<= 20` entries.
   - `templates` list is strictly bounded to `<= 10` entries.
   - `updatedBy` must equal `request.auth.uid`, and `updatedAt` must equal `request.time`.
   - Only verified admins (`isAdmin()` + `email_verified == true`) can create, update, or delete `/config/workspace`.
   - `allow list` is explicitly disabled (`false`) to prevent collection scraping.

2. **Admin Registry (`/admins/{uid}`)**:
   - Isolated PII (`email`): readable (`get`) ONLY by the document owner (`request.auth.uid == uid`) or verified super-admin (`isSuperAdmin()`).
   - `allow list` is disabled (`false`) to prevent user enumeration.
   - Self-elevation prevention: non-super-admins cannot create or mutate admin records or escalate their role.
   - `uid` is immutable after creation (`incoming().uid == existing().uid`) and `createdAt` is immutable (`incoming().createdAt == existing().createdAt`).

3. **Connection Test Doc (`/test/connection`)**:
   - Read-only (`get`) allowed strictly for `docId == 'connection'` to support `getDocFromServer` boot verification; all writes denied (`false`).

---

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)

1. **Unauthenticated Write to Config**: `SET /config/workspace` with `request.auth == null`.
2. **Unverified Email Spoof**: `SET /config/workspace` with `email == 'fatchiano1@gmail.com'` and `email_verified == false`.
3. **Non-Admin Signed-In User Write**: `SET /config/workspace` as random Google user not in `/admins/{uid}` and not `fatchiano1@gmail.com`.
4. **Shadow/Ghost Field Injection**: `SET /config/workspace` including an extra field `isSuperUser: true` (blocked by `keys().hasOnly(...)`).
5. **Identity Spoofing in `updatedBy`**: Admin writes `/config/workspace` with `updatedBy: 'someone_else_uid'`.
6. **Client Timestamp Forgery**: Admin writes `/config/workspace` with `updatedAt: '2020-01-01T00:00:00Z'` instead of `request.time`.
7. **Unbounded Array / Denial-of-Wallet**: Admin writes `templates` with 50 items (`> 10`) or `academicYears` with 100 items (`> 20`).
8. **1MB String Resource Poisoning**: Admin writes `spreadsheetId` of length 2000 chars (`> 128`) or containing invalid characters (`'../../etc/passwd'`).
9. **Wrong Document ID Under `/config`**: Writing `/config/arbitrary_doc` (`configId != 'workspace'`).
10. **PII Self-Escalation on `/admins/{uid}`**: Signed-in non-admin tries to create `/admins/{myUid}` with `role: 'Hubin'`.
11. **PII Cross-User Read on `/admins/{otherUid}`**: Non-admin reads another admin's `/admins/{otherUid}` document containing `email`.
12. **Blanket Collection Listing**: Attempting `LIST /config` or `LIST /admins` to scrape documents.
