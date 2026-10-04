/* ────────────────────────────────────────────────────────────────────────
   FormaCore - product tour scenes
   The homepage's tabbed tour of the staff console and the member portal. Each
   scene is a real screen recording of the seeded demo gym, in
   `public/tour/<clip>-<light|dark>.{mp4,webm,jpg}`, made by
   `node apps/e2e/scripts/record-product-tour.mjs`. Re-run that after a UI change
   so the tour keeps showing the product as it is.
   ──────────────────────────────────────────────────────────────────────── */

export type TourScene = {
  id: string;
  /** Pill label. */
  label: string;
  title: string;
  body: string;
  /** Clip base name in /public/tour. */
  clip: string;
  /** The recording's device frame on the card: a browser window or a phone. */
  frame: 'browser' | 'phone';
  /** Address shown in the browser window's bar. */
  url?: string;
};

export const TOUR_SCENES: TourScene[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    title: 'Your whole gym, on one screen.',
    body: "Revenue, check-ins, new members and today's classes the moment you sign in, with trends over the week, the month or the last twelve weeks.",
    clip: 'dashboard',
    frame: 'browser',
    url: 'app.formacore.io/admin',
  },
  {
    id: 'members',
    label: 'Members',
    title: 'Every member, one clear picture.',
    body: 'Find anyone in a second and open a profile with their plan, payments, visits and lifetime value, so your team sees who needs attention before they drift.',
    clip: 'members',
    frame: 'browser',
    url: 'app.formacore.io/admin/members',
  },
  {
    id: 'schedule',
    label: 'Schedule',
    title: 'Your whole week, at a glance.',
    body: 'Classes, coaches and branches on one calendar. Open any session to see who booked, how full it is and who is waiting for a spot.',
    clip: 'schedule',
    frame: 'browser',
    url: 'app.formacore.io/admin/classes',
  },
  {
    id: 'reports',
    label: 'Reports',
    title: 'Know who needs you next.',
    body: 'Ready-made reports on sales, members, revenue, classes and staff. See whose renewal is due or who stopped turning up, and export any of them to CSV or Excel.',
    clip: 'reports',
    frame: 'browser',
    url: 'app.formacore.io/admin/reports',
  },
  {
    id: 'portal',
    label: 'Member portal',
    title: 'Booking members actually enjoy.',
    body: 'Your branded member portal puts the timetable, their plan and their bookings in one place. They pick a class and book a spot in two clicks, on any device.',
    clip: 'portal',
    frame: 'browser',
    url: 'yourgym.formacore.io/member/classes',
  },
];
