let activeTabId = null;

export function setActiveTabId(id) {
  activeTabId = id;
}

export function getActiveTabId() {
  return activeTabId;
}

export async function handleNativeMessage(message, sendToTab) {
  if (activeTabId === null) {
    return { success: false, error: 'No App Inventor tab found' };
  }

  return await sendToTab(activeTabId, message);
}

export function handleContentResponse(response) {
  return response;
}
