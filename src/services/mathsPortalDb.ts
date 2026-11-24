import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import {
  ADMIN_EMAIL,
  db,
  handleFirestoreError,
  OperationType,
} from './firebaseApp';

export type DoubtStatus = 'open' | 'scheduled' | 'resolved';
export type ZoomSessionStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';

export interface UserProfileRecord {
  uid: string;
  displayName: string;
  email: string;
  role: 'student' | 'admin';
  gradeLevel?: string;
}

export interface MathsDoubtRecord {
  id: string;
  studentUid: string;
  studentName: string;
  title: string;
  question: string;
  status: DoubtStatus;
  zoomSessionId?: string;
  zoomJoinUrl?: string;
  zoomScheduledFor?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface ZoomSessionRecord {
  id: string;
  title: string;
  zoomLink: string;
  meetingId?: string;
  passcode?: string;
  scheduledAtIso: string;
  durationMinutes: number;
  audience: 'all';
  doubtCount?: number;
  notes?: string;
  status: ZoomSessionStatus;
  createdByUid: string;
  tutorName: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

function makeDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function clampStr(val: string, max: number): string {
  return val.trim().slice(0, max);
}

export function isTutorAdminUser(user: User | null): boolean {
  return Boolean(
    user &&
      user.emailVerified &&
      user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  );
}

export function isValidHttpsZoomUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

export async function ensureUserProfile(user: User): Promise<UserProfileRecord> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  const role: 'student' | 'admin' = isTutorAdminUser(user) ? 'admin' : 'student';

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as UserProfileRecord;
    }

    const profilePayload = {
      uid: user.uid,
      displayName: clampStr(
        user.displayName || user.email?.split('@')[0] || 'Student',
        80
      ),
      email: clampStr(user.email || 'student@openmaths.org', 160),
      role,
      gradeLevel: role === 'admin' ? 'O/L Maths Tutor' : 'O/L Mathematics',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(ref, profilePayload);
    return {
      uid: profilePayload.uid,
      displayName: profilePayload.displayName,
      email: profilePayload.email,
      role: profilePayload.role,
      gradeLevel: profilePayload.gradeLevel,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export function subscribeDoubts(
  user: User,
  isAdmin: boolean,
  onData: (doubts: MathsDoubtRecord[]) => void,
  onError: (err: Error) => void
): () => void {
  const path = 'doubts';
  const doubtsRef = collection(db, 'doubts');
  const q = isAdmin
    ? query(doubtsRef, orderBy('createdAt', 'desc'))
    : query(
        doubtsRef,
        where('studentUid', '==', user.uid),
        orderBy('createdAt', 'desc')
      );

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as MathsDoubtRecord);
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(
          wrapped instanceof Error ? wrapped : new Error(String(wrapped))
        );
      }
    }
  );
}

export function subscribeZoomSessions(
  user: User,
  isAdmin: boolean,
  onData: (sessions: ZoomSessionRecord[]) => void,
  onError: (err: Error) => void
): () => void {
  const path = 'zoomSessions';
  const sessionsRef = collection(db, 'zoomSessions');

  if (!user) {
    return () => {};
  }

  const q = isAdmin
    ? query(sessionsRef, orderBy('scheduledAtIso', 'asc'))
    : query(
        sessionsRef,
        where('audience', '==', 'all'),
        orderBy('scheduledAtIso', 'asc')
      );

  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => d.data() as ZoomSessionRecord));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(
          wrapped instanceof Error ? wrapped : new Error(String(wrapped))
        );
      }
    }
  );
}

export async function submitMathsDoubt(
  user: User,
  input: {
    title: string;
    question: string;
  }
): Promise<string> {
  const id = makeDocId('doubt');
  const path = `doubts/${id}`;

  const title = clampStr(input.title, 140);
  const question = clampStr(input.question, 2500);
  if (title.length < 3) {
    throw new Error('Please enter a short summary of at least 3 characters.');
  }
  if (question.length < 5) {
    throw new Error(
      'Please describe your maths doubt in at least 5 characters.'
    );
  }

  try {
    await setDoc(doc(db, 'doubts', id), {
      id,
      studentUid: user.uid,
      studentName: clampStr(
        user.displayName || user.email?.split('@')[0] || 'Student',
        80
      ),
      title,
      question,
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function markDoubtResolvedByStudent(
  doubtId: string
): Promise<void> {
  const path = `doubts/${doubtId}`;
  try {
    await updateDoc(doc(db, 'doubts', doubtId), {
      status: 'resolved',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteOpenDoubt(doubtId: string): Promise<void> {
  const path = `doubts/${doubtId}`;
  try {
    await deleteDoc(doc(db, 'doubts', doubtId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function scheduleGroupZoomSessionAsAdmin(
  adminUser: User,
  input: {
    title: string;
    zoomLink: string;
    meetingId?: string;
    passcode?: string;
    scheduledAtIso: string;
    durationMinutes: number;
    notes?: string;
    selectedDoubtIds?: string[];
  }
): Promise<ZoomSessionRecord> {
  const id = makeDocId('zoom');
  const path = `zoomSessions/${id}`;

  const title = clampStr(input.title, 140);
  const zoomLink = clampStr(input.zoomLink, 300);
  if (title.length < 3) {
    throw new Error('Session title must be at least 3 characters.');
  }
  if (!isValidHttpsZoomUrl(zoomLink)) {
    throw new Error('Zoom meeting link must start with https://');
  }

  const duration = Math.min(
    180,
    Math.max(15, Math.round(input.durationMinutes))
  );
  const doubtIds = (input.selectedDoubtIds || []).slice(0, 400);

  const recordData: Record<string, unknown> = {
    id,
    title,
    zoomLink,
    scheduledAtIso: clampStr(input.scheduledAtIso, 40),
    durationMinutes: duration,
    audience: 'all',
    doubtCount: doubtIds.length,
    status: 'scheduled',
    createdByUid: adminUser.uid,
    tutorName: clampStr(adminUser.displayName || 'O/L Maths Tutor', 80),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (input.meetingId?.trim()) {
    recordData.meetingId = clampStr(input.meetingId, 40);
  }
  if (input.passcode?.trim()) {
    recordData.passcode = clampStr(input.passcode, 40);
  }
  if (input.notes?.trim()) {
    recordData.notes = clampStr(input.notes, 1000);
  }

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'zoomSessions', id), recordData);

    for (const doubtId of doubtIds) {
      batch.update(doc(db, 'doubts', doubtId), {
        status: 'scheduled',
        zoomSessionId: id,
        zoomJoinUrl: zoomLink,
        zoomScheduledFor: clampStr(input.scheduledAtIso, 40),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }

  return {
    id,
    title,
    zoomLink,
    meetingId: recordData.meetingId as string | undefined,
    passcode: recordData.passcode as string | undefined,
    scheduledAtIso: String(recordData.scheduledAtIso),
    durationMinutes: duration,
    audience: 'all',
    doubtCount: doubtIds.length,
    notes: recordData.notes as string | undefined,
    status: 'scheduled',
    createdByUid: adminUser.uid,
    tutorName: String(recordData.tutorName),
  };
}

export async function bulkUpdateDoubtStatusAsAdmin(
  doubtIds: string[],
  status: DoubtStatus
): Promise<void> {
  if (doubtIds.length === 0) return;
  const path = 'doubts';
  try {
    const batch = writeBatch(db);
    for (const doubtId of doubtIds.slice(0, 400)) {
      batch.update(doc(db, 'doubts', doubtId), {
        status,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateZoomSessionStatus(
  sessionId: string,
  status: ZoomSessionStatus
): Promise<void> {
  const path = `zoomSessions/${sessionId}`;
  try {
    await updateDoc(doc(db, 'zoomSessions', sessionId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteZoomSession(sessionId: string): Promise<void> {
  const path = `zoomSessions/${sessionId}`;
  try {
    await deleteDoc(doc(db, 'zoomSessions', sessionId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
