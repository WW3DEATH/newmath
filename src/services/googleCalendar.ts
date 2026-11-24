import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User,
} from 'firebase/auth';
import { auth } from './firebaseApp';

export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
];

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));

// Strictly in-memory token cache — never persist OAuth tokens in localStorage/sessionStorage
let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthChange: (user: User | null, token: string | null) => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthChange(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthChange(user, null);
      }
    } else {
      cachedAccessToken = null;
      onAuthChange(null, null);
    }
  });
};

export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string | null;
}> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedAccessToken = credential?.accessToken ?? null;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const clearAccessToken = () => {
  cachedAccessToken = null;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

export interface CalendarEventItem {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  status?: string;
}

export interface CreateBookingInput {
  summary: string;
  location: string;
  description: string;
  startIso: string;
  endIso: string;
}

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary';

async function parseCalendarResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('AUTH_EXPIRED');
  }
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg =
      errBody?.error?.message || `Calendar request failed (${res.status})`;
    throw new Error(msg);
  }
  if (res.status === 204) {
    return {} as T;
  }
  return res.json() as Promise<T>;
}

export async function listUpcomingEvents(
  accessToken: string,
  daysAhead = 21
): Promise<CalendarEventItem[]> {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const maxDate = new Date(startOfDay);
  maxDate.setDate(maxDate.getDate() + daysAhead);

  const params = new URLSearchParams({
    timeMin: startOfDay.toISOString(),
    timeMax: maxDate.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  });

  const res = await fetch(`${CALENDAR_BASE}/events?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await parseCalendarResponse<{ items?: CalendarEventItem[] }>(res);
  return (data.items || []).filter((item) => item.status !== 'cancelled');
}

export async function createCalendarEvent(
  accessToken: string,
  input: CreateBookingInput
): Promise<CalendarEventItem> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const res = await fetch(`${CALENDAR_BASE}/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: input.summary,
      location: input.location,
      description: input.description,
      start: {
        dateTime: input.startIso,
        timeZone,
      },
      end: {
        dateTime: input.endIso,
        timeZone,
      },
    }),
  });

  return parseCalendarResponse<CalendarEventItem>(res);
}

export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  updates: Partial<CreateBookingInput>
): Promise<CalendarEventItem> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const body: Record<string, unknown> = {};
  if (updates.summary !== undefined) body.summary = updates.summary;
  if (updates.location !== undefined) body.location = updates.location;
  if (updates.description !== undefined) body.description = updates.description;
  if (updates.startIso !== undefined) {
    body.start = { dateTime: updates.startIso, timeZone };
  }
  if (updates.endIso !== undefined) {
    body.end = { dateTime: updates.endIso, timeZone };
  }

  const res = await fetch(
    `${CALENDAR_BASE}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  return parseCalendarResponse<CalendarEventItem>(res);
}

export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const res = await fetch(
    `${CALENDAR_BASE}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  await parseCalendarResponse<void>(res);
}
