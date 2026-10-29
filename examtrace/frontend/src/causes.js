// Colour and short name for every root-cause category (must match backend CAUSES keys).
export const CAUSES = {
  server_overload: { label: 'Server overload', color: '#C2410C' },
  database_bottleneck: { label: 'Database bottleneck', color: '#7C3AED' },
  network_server: { label: 'Network (server side)', color: '#0369A1' },
  network_student: { label: 'Network (student side)', color: '#0E7490' },
  app_bug: { label: 'Application bug', color: '#BE123C' },
  session_auth: { label: 'Session / authentication', color: '#A16207' },
  device_browser: { label: 'Device / browser', color: '#4D7C0F' },
  third_party: { label: 'Third-party service', color: '#9D174D' },
  misconfiguration: { label: 'Misconfiguration', color: '#475569' },
  normal: { label: 'No issue found', color: '#15803D' },
};

export const CATEGORIES = [
  ['slow', 'Slow response'],
  ['freeze', 'Screen froze'],
  ['question_not_loading', 'Question not loading'],
  ['submit_failed', 'Answer or submit failed'],
  ['logged_out', 'Logged out'],
  ['other', 'Something else'],
];

export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';
export const fmtTime = (d) => (d ? new Date(d).toISOString().slice(11, 16) : '-');
export const fmtNumber = (n) => (n == null ? '-' : Number(n).toLocaleString());
