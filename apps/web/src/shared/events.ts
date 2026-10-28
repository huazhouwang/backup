/** Funnel events the app records (issues 188, 196), shared by the client that sends them and the Worker that checks them */
export const EVENTS = ['interview_started', 'options_shown', 'option_picked', 'followup', 'showcase_viewed', 'design_own', 'remix'] as const;
export type EventName = (typeof EVENTS)[number];
