export function projectIdToBase36(projectId) {
  return parseInt(projectId).toString(36).toUpperCase();
}

export function buildSave2Request({
  baseUrl,
  gwtPermutationHash,
  sessionUuid,
  filePath,
  scmContent,
  projectId
}) {
  const base36 = projectIdToBase36(projectId);
  return [
    '7|0|10',
    baseUrl,
    gwtPermutationHash,
    'com.google.appinventor.shared.rpc.project.ProjectService',
    'save2',
    'java.lang.String/2004016611',
    'J',
    'Z',
    sessionUuid,
    filePath,
    scmContent,
    '1|2|3|4|5|5|6|5|7|5|8',
    base36,
    '9|0|10|'
  ].join('|');
}
