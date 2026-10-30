export function extractAiVerdict(report = '') {
  const text = String(report || '').trim();
  if (!text) return null;

  const causeMatch =
    text.match(/\*\*Likely root cause:\s*(?:`)?([^`*]+?)(?:`)?\*\*/i) ||
    text.match(/Likely root cause:\s*(?:`)?([^`*\n]+?)(?:`)?(?:\s*\(|\s*$)/i) ||
    text.match(/\*\*Most likely root cause:\s*(?:`)?([^`*]+?)(?:`)?\*\*/i) ||
    text.match(/Most likely root cause:\s*(?:`)?([^`*\n]+?)(?:`)?(?:\s*\(|\s*$)/i);

  const confidenceMatch =
    text.match(/model confidence\s+(\d+(?:\.\d+)?)%/i) ||
    text.match(/confidence\s+(\d+(?:\.\d+)?)%/i);

  const headingMatch =
    text.match(/^(?:#+\s+)?Incident\s+\d+.*$/im) ||
    text.match(/^#+\s+.*$/m);

  const cause = causeMatch ? causeMatch[1].replace(/[*`]/g, '').trim() : null;
  const confidence = confidenceMatch ? Number(confidenceMatch[1]) : null;
  const heading = headingMatch ? headingMatch[0].replace(/^#+\s*/, '').trim() : 'AI model detected a likely incident.';

  return { cause, confidence, heading };
}
