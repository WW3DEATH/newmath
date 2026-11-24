# Security Specification — OpenMaths OL Student Doubt & Group Zoom Portal

## 1. Data Invariants
1. A user profile at `/users/{userId}` can only be read or modified by its owner (`request.auth.uid == userId`) or the verified Tutor Admin (`mnmjaasim@gmail.com`). Users cannot self-assign `role: 'admin'`.
2. A student maths doubt at `/doubts/{doubtId}` has no topic restrictions, must carry `studentUid == request.auth.uid` on creation, `status == 'open'`, and server-enforced timestamps (`createdAt == request.time`, `updatedAt == request.time`).
3. Doubts are answered live in bulk group Zoom sessions rather than text replies on the website. Students cannot forge `zoomSessionId`, `zoomJoinUrl`, or `zoomScheduledFor` when submitting or editing their doubts. Only the verified Tutor Admin can link doubts to a scheduled Zoom session or update their status.
4. Once a doubt reaches terminal `status == 'resolved'`, students cannot modify it; only the Tutor Admin can reopen or update it.
5. Group Zoom sessions at `/zoomSessions/{sessionId}` can ONLY be created, updated, or deleted by the verified Tutor Admin anytime. Every group session carries `audience == 'all'` so all signed-in students can view and join live sessions.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated read** on `/doubts`, `/zoomSessions`, or `/users`.
2. **Self-privilege escalation**: Student creating `/users/{uid}` with `role: 'admin'`.
3. **Role tampering**: Student updating `/users/{uid}` with `affectedKeys` containing `role`.
4. **Cross-user PII snooping**: Student A calling `get` on `/users/{studentBUid}`.
5. **Email spoofing**: Unverified token (`email_verified: false`) with `email: 'mnmjaasim@gmail.com'` attempting admin read/write.
6. **Student identity spoofing on doubt creation**: Student A creating `/doubts/d1` with `studentUid: 'studentB'`.
7. **State shortcutting on doubt creation**: Student creating `/doubts/d1` with `status: 'scheduled'` and fake `zoomJoinUrl`.
8. **Shadow field injection**: Submitting `/doubts/d1` with an extra ghost key `isPriorityApproved: true`.
9. **XSS / JavaScript URI injection in Zoom link**: Writing `zoomLink: 'javascript:alert(1)'` into `/zoomSessions/s1`.
10. **Client timestamp forgery**: Creating `/doubts/d1` with a forged past `createdAt` instead of `request.time`.
11. **Student unauthorized Zoom session creation**: Non-admin student attempting `create` on `/zoomSessions/s1`.
12. **Path ID poisoning**: Creating `/doubts/{badId}` where `badId` exceeds 128 chars or contains invalid characters (`../admin`).
