/** Funnel events the app records (issue 188), shared by the client that sends them and the Worker that checks them */
export const EVENTS = ['interview_started', 'options_shown', 'option_picked', 'followup'] as const;
export type EventName = (typeof EVENTS)[number];
