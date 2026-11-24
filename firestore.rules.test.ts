/**
 * Security Rule Verification Payloads ("Dirty Dozen") for OpenMaths OL Portal.
 * Documents the adversarial test cases verified against DRAFT_firestore.rules / firestore.rules.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expectedOutcome: 'PERMISSION_DENIED';
  rationale: string;
  payload?: Record<string, unknown>;
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated read on doubts',
    collectionPath: '/doubts/d1',
    operation: 'get',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'isSignedIn() is false when request.auth is null.',
  },
  {
    id: 2,
    name: 'Student self-promotion to admin on user creation',
    collectionPath: '/users/student_uid_1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'Non-admin cannot create profile with role: admin.',
    payload: {
      uid: 'student_uid_1',
      displayName: 'Alex',
      email: 'alex@example.com',
      role: 'admin',
    },
  },
  {
    id: 3,
    name: 'Student tampering role on user update',
    collectionPath: '/users/student_uid_1',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'affectedKeys().hasOnly([displayName, gradeLevel, updatedAt]) blocks role edits.',
    payload: { role: 'admin' },
  },
  {
    id: 4,
    name: 'Cross-user PII snooping on /users',
    collectionPath: '/users/other_student_uid',
    operation: 'get',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'isOwner(userId) || isAdmin() prevents reading another student email/profile.',
  },
  {
    id: 5,
    name: 'Email spoofing without email_verified',
    collectionPath: '/zoomSessions/s1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'isAdmin() mandates request.auth.token.email_verified == true.',
  },
  {
    id: 6,
    name: 'Student spoofing studentUid on doubt creation',
    collectionPath: '/doubts/d1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'incoming().studentUid == request.auth.uid rejects mismatched UIDs.',
    payload: { studentUid: 'other_uid', status: 'open' },
  },
  {
    id: 7,
    name: 'State shortcutting on doubt creation',
    collectionPath: '/doubts/d1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'Doubts must start in status == open with no pre-populated zoomJoinUrl.',
    payload: {
      status: 'scheduled',
      zoomJoinUrl: 'https://zoom.us/j/123456',
    },
  },
  {
    id: 8,
    name: 'Shadow field injection on doubt creation',
    collectionPath: '/doubts/d1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'isValidMathsDoubt uses data.keys().hasOnly(...) to block ghost keys.',
    payload: { isPriorityApproved: true },
  },
  {
    id: 9,
    name: 'XSS javascript: URI in Zoom meeting link',
    collectionPath: '/zoomSessions/s1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'zoomLink must match ^https://.* regex.',
    payload: { zoomLink: 'javascript:alert(1)' },
  },
  {
    id: 10,
    name: 'Client timestamp forgery on doubt creation',
    collectionPath: '/doubts/d1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'createdAt == request.time rejects backdated client timestamps.',
  },
  {
    id: 11,
    name: 'Student creating Zoom session directly',
    collectionPath: '/zoomSessions/s1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'Only verified Tutor Admin can create/update/delete zoomSessions.',
  },
  {
    id: 12,
    name: 'Path ID poisoning on /doubts',
    collectionPath: '/doubts/bad..id/../../x',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'isValidId(doubtId) enforces ^[a-zA-Z0-9_\\-]+$ and <= 128 chars.',
  },
];
