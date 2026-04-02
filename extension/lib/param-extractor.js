export function extractPermutationHash(html) {
  const match = html.match(/([A-F0-9]{32})\.cache\.js/);
  return match ? match[1] : null;
}

export function extractSessionUuid(body) {
  const match = body.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
  return match ? match[1] : null;
}
