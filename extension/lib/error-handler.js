export function detectSessionExpiry(response) {
  if (!response) return false;
  return response.status === 401 || response.status === 403;
}

export function detectNotOnPage(globals) {
  return !globals.hasBlocklyPanel || !globals.hasBlockly;
}

export function createErrorResponse(code, errorOrMessage) {
  const message = errorOrMessage instanceof Error ? errorOrMessage.message : errorOrMessage;
  return { success: false, error: message, code };
}
