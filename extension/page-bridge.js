// Page bridge — runs in MAIN world, accesses App Inventor globals directly
// Receives tool calls from content.js via postMessage, executes, responds

(function() {
  'use strict';

  const BRIDGE_PREFIX = 'appinventor-mcp-';

  // --- Session parameter capture ---
  let capturedSessionUuid = null;
  let capturedFilePath = null;
  let capturedGwtHash = null;

  // Extract GWT permutation hash from page scripts (for X-GWT-Permutation header)
  let gwtPermutationHash = null;
  function extractGwtPermutation() {
    if (gwtPermutationHash) return gwtPermutationHash;
    const scripts = document.querySelectorAll('script[src*=".cache.js"]');
    for (const s of scripts) {
      const match = s.src.match(/([A-Fa-f0-9]{32,})\.cache\.js/);
      if (match) {
        gwtPermutationHash = match[1];
        return gwtPermutationHash;
      }
    }
    return null;
  }

  // Also try extracting from GWT's nocache.js selection
  function extractGwtHash() {
    if (capturedGwtHash) return capturedGwtHash;
    // Will be captured from intercepted save2 body
    return null;
  }

  // Intercept XHR to capture all params from save2 calls
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(body) {
    if (typeof body === 'string' && body.includes('save2')) {
      const fields = body.split('|');
      if (fields.length > 4) capturedGwtHash = fields[4];
      const uuidMatch = body.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
      if (uuidMatch) capturedSessionUuid = uuidMatch[1];
      const pathMatch = body.match(/(src\/appinventor\/[^|]+\.scm)/);
      if (pathMatch) capturedFilePath = pathMatch[1];
      const base36Match = body.match(/\|8\|([A-Za-z0-9]+)\|9\|/);
      if (base36Match) capturedBase36 = base36Match[1];
      // Capture SCM JSON and save full body as template
      const scmMatch = body.match(/#\\!\n\$JSON\n([\s\S]*?)\n\\!#/);
      if (scmMatch) {
        try {
          capturedScmJson = JSON.parse(scmMatch[1]);
          // Save the full body, replacing only the JSON portion with a placeholder
          capturedRpcTemplate = body.replace(scmMatch[1], '___SCM_PLACEHOLDER___');
        } catch(e) {}
      }
      console.log('[MCP Bridge] Intercepted save2 params:', {
        gwtHash: capturedGwtHash, sessionUuid: capturedSessionUuid,
        filePath: capturedFilePath, base36: capturedBase36,
        hasScm: !!capturedScmJson, hasTemplate: !!capturedRpcTemplate
      });
      // Write to cache via content script
      window.postMessage({
        type: BRIDGE_PREFIX + 'cache-write',
        data: {
          sessionUuid: capturedSessionUuid,
          gwtHash: capturedGwtHash,
          filePath: capturedFilePath,
          base36: capturedBase36,
          scmJson: capturedScmJson,
          rpcTemplate: capturedRpcTemplate,
          timestamp: Date.now()
        }
      }, '*');
    }
    return origSend.apply(this, arguments);
  };

  // Direct extraction fallbacks — don't rely on intercepting save2
  function extractSessionUuid() {
    if (capturedSessionUuid) return capturedSessionUuid;
    // Try extracting from GWT's internal state via cookie or meta
    const cookies = document.cookie;
    const match = cookies.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
    if (match) { capturedSessionUuid = match[1]; return match[1]; }
    // Try performance entries for past save2 XHRs
    const entries = performance.getEntriesByType('resource');
    for (const e of entries) {
      if (e.name.includes('/ode/') && e.initiatorType === 'xmlhttprequest') {
        // We found an ODE request — session UUID was in the body, but we can't read it from perf entries
        // Fall through to force-trigger approach
      }
    }
    return null;
  }

  function extractFilePath(screenName) {
    if (capturedFilePath) return capturedFilePath;
    // Construct file path from known patterns
    // Format: src/appinventor/ai_<user>/<projectName>/Screen1.scm
    try {
      const projectName = typeof BlocklyPanel_getProjectName === 'function' ? BlocklyPanel_getProjectName() : null;
      if (!projectName) return null;
      // Try to find user email from page
      const userEl = document.querySelector('.ode-TopPanelUserEmail') ||
                     document.querySelector('[class*="UserEmail"]') ||
                     document.querySelector('.gwt-Label[title*="@"]');
      let userPrefix = null;
      if (userEl) {
        const email = userEl.textContent || userEl.title || '';
        userPrefix = 'ai_' + email.replace(/@/g, '_').replace(/\./g, '_');
      }
      // Also try from the page URL or GWT state
      if (!userPrefix) {
        // Scan all text nodes for the path pattern
        const bodyText = document.body.innerHTML;
        const pathMatch = bodyText.match(/src\/appinventor\/(ai_[^/]+)\//);
        if (pathMatch) userPrefix = pathMatch[1];
      }
      if (userPrefix) {
        capturedFilePath = `src/appinventor/${userPrefix}/${projectName}/${screenName || 'Screen1'}.scm`;
        return capturedFilePath;
      }
    } catch(e) {}
    return null;
  }

  // Captured SCM content, base36, and full RPC body template from save2 request
  let capturedScmJson = null;
  let capturedBase36 = null;
  let capturedRpcTemplate = null; // Full RPC body with SCM placeholder

  // Force a save2 by making a trivial property change, then capture ALL params from XHR
  function forceSave2Capture() {
    return new Promise((resolve) => {
      const origSend2 = XMLHttpRequest.prototype.send;
      let resolved = false;
      XMLHttpRequest.prototype.send = function(body) {
        if (!resolved && typeof body === 'string' && body.includes('save2')) {
          // Parse the pipe-delimited fields
          const fields = body.split('|');
          // Field layout: 7|0|10|baseUrl|gwtHash|service|save2|stringType|J|Z|uuid|path|scmContent|params...
          // GWT hash is field index 4 (0-indexed: 3)
          if (fields.length > 4) capturedGwtHash = fields[4];

          const uuidMatch = body.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
          if (uuidMatch) capturedSessionUuid = uuidMatch[1];
          const pathMatch = body.match(/(src\/appinventor\/[^|]+\.scm)/);
          if (pathMatch) capturedFilePath = pathMatch[1];

          // Capture base36 project ID from the parameter section at the end
          // Pattern: |8|{base36}|9|0|10|
          const base36Match = body.match(/\|8\|([A-Za-z0-9]+)\|9\|/);
          if (base36Match) capturedBase36 = base36Match[1];

          // Capture the current SCM JSON from the body
          const scmMatch = body.match(/#\\!\n\$JSON\n([\s\S]*?)\n\\!#/);
          if (scmMatch) {
            try { capturedScmJson = JSON.parse(scmMatch[1]); } catch(e) {
              console.log('[MCP Bridge] SCM parse error:', e.message);
            }
          }
          console.log('[MCP Bridge] Captured all params:', {
            gwtHash: capturedGwtHash,
            sessionUuid: capturedSessionUuid,
            filePath: capturedFilePath,
            base36: capturedBase36,
            hasScm: !!capturedScmJson
          });
          resolved = true;
          XMLHttpRequest.prototype.send = origSend2;
          resolve(true);
        }
        return origSend2.apply(this, arguments);
      };
      // Trigger save by toggling a property via GWT
      if (typeof BlocklyPanel_setComponentProperty === 'function') {
        const screen = typeof BlocklyPanel_getCurrentScreen === 'function' ? BlocklyPanel_getCurrentScreen() : 'Screen1';
        const title = typeof BlocklyPanel_getComponentInstancePropertyValue === 'function'
          ? BlocklyPanel_getComponentInstancePropertyValue(screen, screen, 'Title') : 'Screen1';
        BlocklyPanel_setComponentProperty(screen, screen, 'Title', title + ' ', 'Title');
        setTimeout(() => {
          BlocklyPanel_setComponentProperty(screen, screen, 'Title', title, 'Title');
        }, 200);
      }
      setTimeout(() => { if (!resolved) { resolved = true; XMLHttpRequest.prototype.send = origSend2; resolve(false); } }, 5000);
    });
  }

  // --- Tool implementations ---

  function handle_get_project_info() {
    return {
      success: true,
      projectId: typeof HTML5DragDrop_getOpenProjectId === 'function' ? HTML5DragDrop_getOpenProjectId() : null,
      projectName: typeof BlocklyPanel_getProjectName === 'function' ? BlocklyPanel_getProjectName() : null,
      isEditorOpen: document.querySelector('.ode-Box') !== null,
      isBlocksEditorOpen: typeof Blockly !== 'undefined' && Blockly.getMainWorkspace() !== null,
      currentScreen: typeof BlocklyPanel_getCurrentScreen === 'function' ? BlocklyPanel_getCurrentScreen() : 'Screen1'
    };
  }

  async function handle_get_component_tree(params) {
    const screenName = params.screenName || 'Screen1';

    // If we already have cached SCM for this screen, return it
    if (capturedScmJson && capturedFilePath) {
      const cachedScreen = capturedFilePath.replace(/.*\/([^/]+)\.scm$/, '$1');
      if (cachedScreen === screenName) {
        return { success: true, screen: screenName, tree: capturedScmJson };
      }
    }

    // Force a save to capture the current SCM
    const got = await getCurrentScm();
    if (!got || !capturedScmJson) {
      return { success: false, error: 'Could not capture component tree. Make sure you are in the Designer view.' };
    }

    return { success: true, screen: screenName, tree: capturedScmJson };
  }

  // Recursively find a component by $Name in the SCM tree
  function findComponentInTree(node, name) {
    if (node.$Name === name) return node;
    if (node.$Components) {
      for (const child of node.$Components) {
        const found = findComponentInTree(child, name);
        if (found) return found;
      }
    }
    return null;
  }

  // Recursively remove components by name from the SCM tree
  function removeComponentsFromTree(node, names) {
    if (node.$Components) {
      node.$Components = node.$Components.filter(c => !names.includes(c.$Name));
      for (const child of node.$Components) {
        removeComponentsFromTree(child, names);
      }
    }
  }

  // Save the current SCM back via save2
  function saveScm(scm) {
    const permHash = extractGwtPermutation();
    if (!permHash) return { success: false, error: 'Could not extract GWT permutation hash' };

    const sessionUuid = capturedSessionUuid || generateUuid();
    const gwtHash = capturedGwtHash || permHash;

    if (!capturedRpcTemplate) {
      // Build from scratch
      const base36 = capturedBase36 || (function() {
        const pid = typeof HTML5DragDrop_getOpenProjectId === 'function' ? HTML5DragDrop_getOpenProjectId() : null;
        return pid ? parseInt(pid).toString(36).toUpperCase() : null;
      })();
      if (!base36 || !capturedFilePath) return { success: false, error: 'Missing session params. Try adding a component first.' };

      const scmContent = '#\\!\n$JSON\n' + JSON.stringify(scm) + '\n\\!#';
      const baseUrl = window.location.origin + '/ode/';
      var rpcBody = '7|0|10|' + baseUrl + '|' + gwtHash +
        '|com.google.appinventor.shared.rpc.project.ProjectService|save2|' +
        'java.lang.String/2004016611|J|Z|' + sessionUuid + '|' +
        capturedFilePath + '|' + scmContent +
        '|1|2|3|4|5|5|6|5|7|5|8|' + base36 + '|9|0|10|';
    } else {
      var rpcBody = capturedRpcTemplate.replace('___SCM_PLACEHOLDER___', JSON.stringify(scm));
    }

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', window.location.origin + '/ode/projects', false);
      xhr.setRequestHeader('Content-Type', 'text/x-gwt-rpc; charset=UTF-8');
      xhr.setRequestHeader('X-GWT-Module-Base', window.location.origin + '/ode/');
      if (permHash) xhr.setRequestHeader('X-GWT-Permutation', permHash);
      xhr.send(rpcBody);

      if (xhr.status === 200) {
        // Update cached SCM
        capturedScmJson = JSON.parse(JSON.stringify(scm));
        return { success: true };
      } else {
        return { success: false, error: `save2 failed with status ${xhr.status}: ${xhr.responseText.substring(0, 200)}` };
      }
    } catch (err) {
      return { success: false, error: `save2 error: ${err.message}` };
    }
  }

  async function handle_update_component_properties(params) {
    const { componentName, screenName } = params;
    if (!componentName) return { success: false, error: 'componentName is required' };

    // Ensure properties is an object (may arrive as JSON string from MCP)
    let properties = params.properties;
    if (typeof properties === 'string') {
      try { properties = JSON.parse(properties); } catch(e) {
        return { success: false, error: 'properties must be a JSON object' };
      }
    }
    if (!properties || typeof properties !== 'object' || Object.keys(properties).length === 0) {
      return { success: false, error: 'properties object is required' };
    }

    // Try direct GWT property setter first (instant, no save2 needed)
    if (typeof BlocklyPanel_setComponentProperty === 'function') {
      const screen = screenName || (typeof BlocklyPanel_getCurrentScreen === 'function' ? BlocklyPanel_getCurrentScreen() : 'Screen1');
      let directSuccess = true;
      for (const [key, value] of Object.entries(properties)) {
        try {
          BlocklyPanel_setComponentProperty(screen, componentName, key, String(value), key);
        } catch(e) {
          directSuccess = false;
          break;
        }
      }
      if (directSuccess) {
        // Also update cached SCM if we have it
        if (capturedScmJson) {
          const comp = findComponentInTree(capturedScmJson.Properties, componentName);
          if (comp) {
            for (const [key, value] of Object.entries(properties)) {
              comp[key] = String(value);
            }
          }
        }
        return { success: true, method: 'direct', note: 'Properties updated via BlocklyPanel. Changes are live.' };
      }
    }

    // Fallback: SCM edit + save2
    if (!capturedScmJson || !capturedRpcTemplate) {
      const got = await getCurrentScm();
      if (!got || !capturedScmJson) {
        return { success: false, error: 'Could not capture current SCM.' };
      }
    }

    const scm = JSON.parse(JSON.stringify(capturedScmJson));
    const comp = findComponentInTree(scm.Properties, componentName);
    if (!comp) return { success: false, error: `Component "${componentName}" not found in tree` };

    for (const [key, value] of Object.entries(properties)) {
      comp[key] = String(value);
    }

    const result = saveScm(scm);
    if (result.success) {
      result.method = 'save2';
      result.note = 'Switch screens and back to see changes.';
    }
    return result;
  }

  async function handle_remove_components(params) {
    const { componentNames, screenName } = params;
    if (!componentNames || componentNames.length === 0) return { success: false, error: 'componentNames array is required' };

    if (!capturedScmJson || !capturedRpcTemplate) {
      const got = await getCurrentScm();
      if (!got || !capturedScmJson) {
        return { success: false, error: 'Could not capture current SCM.' };
      }
    }

    const scm = JSON.parse(JSON.stringify(capturedScmJson));
    removeComponentsFromTree(scm.Properties, componentNames);

    const result = saveScm(scm);
    if (result.success) {
      result.componentsRemoved = componentNames;
      result.note = 'Switch screens and back to see changes.';
    }
    return result;
  }

  // Generate a UUID v4
  function generateUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // Read current SCM from GWT's internal state by triggering a save and intercepting
  function getCurrentScm() {
    return new Promise((resolve) => {
      const origSend2 = XMLHttpRequest.prototype.send;
      let resolved = false;
      XMLHttpRequest.prototype.send = function(body) {
        if (!resolved && typeof body === 'string' && body.includes('save2')) {
          // Capture all params
          const fields = body.split('|');
          if (fields.length > 4) capturedGwtHash = fields[4];
          const base36Match = body.match(/\|8\|([A-Za-z0-9]+)\|9\|/);
          if (base36Match) capturedBase36 = base36Match[1];
          const pathMatch = body.match(/(src\/appinventor\/[^|]+\.scm)/);
          if (pathMatch) capturedFilePath = pathMatch[1];
          const uuidMatch = body.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
          if (uuidMatch) capturedSessionUuid = uuidMatch[1];
          const scmMatch = body.match(/#\\!\n\$JSON\n([\s\S]*?)\n\\!#/);
          if (scmMatch) {
            try {
              capturedScmJson = JSON.parse(scmMatch[1]);
              capturedRpcTemplate = body.replace(scmMatch[1], '___SCM_PLACEHOLDER___');
            } catch(e) {}
          }
          resolved = true;
          XMLHttpRequest.prototype.send = origSend2;
          resolve(!!capturedScmJson);
        }
        return origSend2.apply(this, arguments);
      };
      // Trigger save
      if (typeof BlocklyPanel_setComponentProperty === 'function') {
        const screen = typeof BlocklyPanel_getCurrentScreen === 'function' ? BlocklyPanel_getCurrentScreen() : 'Screen1';
        const title = typeof BlocklyPanel_getComponentInstancePropertyValue === 'function'
          ? BlocklyPanel_getComponentInstancePropertyValue(screen, screen, 'Title') : 'Screen1';
        BlocklyPanel_setComponentProperty(screen, screen, 'Title', title + ' ', 'Title');
        setTimeout(() => {
          BlocklyPanel_setComponentProperty(screen, screen, 'Title', title, 'Title');
        }, 200);
      }
      setTimeout(() => { if (!resolved) { resolved = true; XMLHttpRequest.prototype.send = origSend2; resolve(false); } }, 8000);
    });
  }

  async function handle_add_components(params) {
    // If we don't have captured SCM/template, try to get it
    if (!capturedScmJson || !capturedRpcTemplate) {
      console.log('[MCP Bridge] No captured SCM, forcing save to capture...');
      const got = await getCurrentScm();
      if (!got || !capturedScmJson || !capturedRpcTemplate) {
        // Last resort: build from scratch
        console.log('[MCP Bridge] Force capture failed, building RPC from scratch');
      }
    }

    // Get permutation hash from page scripts
    const permHash = extractGwtPermutation();
    if (!permHash) {
      return { success: false, error: 'Could not extract GWT permutation hash from page scripts' };
    }

    // Get or generate session UUID
    const sessionUuid = capturedSessionUuid || generateUuid();
    // Get file path — MUST respect screenName param, not just use cached path
    const targetScreen = params.screenName || 'Screen1';
    let filePath = capturedFilePath;
    if (filePath) {
      // Replace the screen name in the cached path to match the target screen
      filePath = filePath.replace(/\/[^/]+\.scm$/, '/' + targetScreen + '.scm');
    } else {
      filePath = (function() {
        const projectName = typeof BlocklyPanel_getProjectName === 'function' ? BlocklyPanel_getProjectName() : null;
        if (!projectName) return null;
        const bodyText = document.body.innerHTML;
        const m = bodyText.match(/src\/appinventor\/(ai_[^/]+)\//);
        if (m) return 'src/appinventor/' + m[1] + '/' + projectName + '/' + targetScreen + '.scm';
        return null;
      })();
    }
    if (!filePath) {
      return { success: false, error: 'Could not determine file path' };
    }
    console.log('[MCP Bridge] add_components target:', targetScreen, 'path:', filePath);
    // Get GWT hash (from body) and base36
    const gwtHash = capturedGwtHash || permHash;
    const base36 = capturedBase36 || (function() {
      const pid = typeof HTML5DragDrop_getOpenProjectId === 'function' ? HTML5DragDrop_getOpenProjectId() : null;
      return pid ? parseInt(pid).toString(36).toUpperCase() : null;
    })();
    if (!base36) {
      return { success: false, error: 'Could not determine project ID' };
    }

    // Build SCM and RPC body
    let rpcBody;
    // Determine if captured SCM belongs to the same screen we're targeting
    const capturedScreen = capturedFilePath ? capturedFilePath.replace(/.*\/([^/]+)\.scm$/, '$1') : null;
    const sameScreen = capturedScreen === targetScreen;
    console.log('[MCP Bridge] capturedScreen:', capturedScreen, 'targetScreen:', targetScreen, 'sameScreen:', sameScreen);

    if (capturedScmJson && capturedRpcTemplate && sameScreen) {
      const scm = JSON.parse(JSON.stringify(capturedScmJson));
      // Find the max existing UUID to avoid conflicts when appending
      const maxUuid = getMaxUuid(scm.Properties);
      const startUuid = params.startUuid || (maxUuid + 1);

      if (params.replaceAll) {
        // Replace mode: wipe all existing components
        scm.Properties.$Components = buildComponentNodes(params.components, startUuid);
      } else {
        // Append mode (default): add new components alongside existing ones
        if (!scm.Properties.$Components) scm.Properties.$Components = [];
        const newNodes = buildComponentNodes(params.components, startUuid);
        scm.Properties.$Components.push(...newNodes);
      }

      rpcBody = capturedRpcTemplate.replace('___SCM_PLACEHOLDER___', JSON.stringify(scm));
      if (capturedFilePath && capturedFilePath !== filePath) {
        rpcBody = rpcBody.replace(capturedFilePath, filePath);
      }
    } else {
      // From-scratch mode: build fresh SCM and RPC body
      const startUuid = params.startUuid || (targetScreen === 'Screen1' ? 1 : 1000);
      const scm = {
        authURL: [window.location.hostname],
        YaVersion: '233',
        Source: 'Form',
        Properties: {
          $Name: targetScreen,
          $Type: 'Form',
          $Version: '31',
          ActionBar: 'True',
          AppName: typeof BlocklyPanel_getProjectName === 'function' ? BlocklyPanel_getProjectName() : 'App',
          Title: targetScreen,
          Uuid: '0',
          $Components: buildComponentNodes(params.components, startUuid)
        }
      };
      const scmContent = '#\\!\n$JSON\n' + JSON.stringify(scm) + '\n\\!#';
      const baseUrl = window.location.origin + '/ode/';
      rpcBody = '7|0|10|' + baseUrl + '|' + gwtHash +
        '|com.google.appinventor.shared.rpc.project.ProjectService|save2|' +
        'java.lang.String/2004016611|J|Z|' + sessionUuid + '|' +
        filePath + '|' + scmContent +
        '|1|2|3|4|5|5|6|5|7|5|8|' + base36 + '|9|0|10|';
    }

    console.log('[MCP Bridge] save2 body length:', rpcBody.length, 'permutation:', permHash);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', window.location.origin + '/ode/projects', false);
      xhr.setRequestHeader('Content-Type', 'text/x-gwt-rpc; charset=UTF-8');
      xhr.setRequestHeader('X-GWT-Module-Base', window.location.origin + '/ode/');
      if (permHash) xhr.setRequestHeader('X-GWT-Permutation', permHash);
      xhr.send(rpcBody);

      console.log('[MCP Bridge] save2 response:', xhr.status, xhr.responseText.substring(0, 300));

      if (xhr.status === 200) {
        // Update cached SCM so subsequent calls see the new state
        const scmMatch = rpcBody.match(/#\\!\n\$JSON\n([\s\S]*?)\n\\!#/);
        if (scmMatch) {
          try { capturedScmJson = JSON.parse(scmMatch[1]); } catch(e) {}
        }
        return {
          success: true,
          componentsAdded: collectNames(params.components),
          reloadRequired: false,
          note: 'Switch screens and back to see changes, or refresh manually.'
        };
      } else {
        return { success: false, error: `save2 failed with status ${xhr.status}: ${xhr.responseText.substring(0, 200)}` };
      }
    } catch (err) {
      return { success: false, error: `save2 error: ${err.message}` };
    }
  }

  function handle_add_blocks(params) {
    try {
      const ws = Blockly.getMainWorkspace();
      if (!ws) return { success: false, error: 'Blockly workspace not available. Switch to Blocks editor.' };

      let xmlStr = params.xml;

      // If structured blocks provided, convert to XML
      if (!xmlStr && params.blocks) {
        xmlStr = '<xml xmlns="https://developers.google.com/blockly/xml">';
        for (const block of params.blocks) {
          xmlStr += structuredToXml(block);
        }
        xmlStr += '</xml>';
      }

      if (!xmlStr) return { success: false, error: 'No xml or blocks provided' };

      const xmlDom = Blockly.utils.xml.textToDom(xmlStr);

      // Don't disable events — App Inventor needs them to trigger auto-save
      const newBlockIds = Blockly.Xml.domToWorkspace(xmlDom, ws);

      // Check for warnings on new blocks
      const warnings = [];
      for (const id of newBlockIds) {
        const block = ws.getBlockById(id);
        if (block && block.warning) {
          warnings.push(block.warning.getText());
        }
      }

      // Force App Inventor to save blocks by firing a synthetic change event
      try {
        if (typeof BlocklyPanel_blocklyWorkspaceChanged === 'function') {
          BlocklyPanel_blocklyWorkspaceChanged(ws);
        }
      } catch(e) { /* best effort */ }

      return {
        success: true,
        blocksAdded: newBlockIds.length,
        warnings
      };
    } catch (err) {
      return { success: false, error: `Block injection error: ${err.message}` };
    }
  }

  function handle_get_blocks(params) {
    try {
      const ws = Blockly.getMainWorkspace();
      if (!ws) return { success: false, error: 'Blockly workspace not available' };

      const format = params.format || 'xml';

      if (format === 'xml') {
        const dom = Blockly.Xml.workspaceToDom(ws);
        const xml = Blockly.utils.xml.domToText(dom);
        return { success: true, xml };
      }

      // Summary format
      const allBlocks = ws.getAllBlocks(false);
      const eventHandlers = [];
      const variables = [];
      const procedures = [];
      let orphanedBlocks = 0;
      const warnings = [];

      for (const block of allBlocks) {
        if (block.type === 'component_event') {
          const mutation = block.mutationToDom && block.mutationToDom();
          eventHandlers.push({
            component: block.getFieldValue('COMPONENT_SELECTOR'),
            event: mutation ? mutation.getAttribute('event_name') : 'unknown',
            blockCount: block.getDescendants(false).length
          });
        }
        if (block.type === 'global_declaration') {
          variables.push(block.getFieldValue('NAME'));
        }
        if (block.type === 'procedures_defnoreturn' || block.type === 'procedures_defreturn') {
          procedures.push({
            name: block.getFieldValue('NAME'),
            hasReturn: block.type === 'procedures_defreturn',
            paramCount: block.arguments_ ? block.arguments_.length : 0
          });
        }
        if (!block.getParent() && block.type !== 'component_event' && block.type !== 'global_declaration' && !block.type.startsWith('procedures_def')) {
          orphanedBlocks++;
        }
        if (block.warning) {
          warnings.push({ blockType: block.type, message: block.warning.getText() });
        }
      }

      return {
        success: true,
        eventHandlers,
        variables,
        procedures,
        totalBlocks: allBlocks.length,
        warnings,
        orphanedBlocks
      };
    } catch (err) {
      return { success: false, error: `get_blocks error: ${err.message}` };
    }
  }

  function handle_get_block_diagnostics() {
    try {
      const ws = Blockly.getMainWorkspace();
      if (!ws) return { success: false, error: 'Blockly workspace not available' };

      const allBlocks = ws.getAllBlocks(false);
      const warnings = [];
      const orphanedBlocks = [];
      let connectedBlocks = 0;

      for (const block of allBlocks) {
        if (block.warning) {
          warnings.push({
            blockId: block.id,
            blockType: block.type,
            component: block.getFieldValue('COMPONENT_SELECTOR') || null,
            message: block.warning.getText()
          });
        }
        if (block.getParent()) {
          connectedBlocks++;
        } else if (block.type !== 'component_event' && block.type !== 'global_declaration' && !block.type.startsWith('procedures_def')) {
          orphanedBlocks.push({ blockId: block.id, blockType: block.type });
        }
      }

      return {
        success: true,
        warnings,
        orphanedBlocks,
        totalBlocks: allBlocks.length,
        connectedBlocks
      };
    } catch (err) {
      return { success: false, error: `diagnostics error: ${err.message}` };
    }
  }

  function handle_get_all_component_types() {
    try {
      if (typeof BlocklyPanel_getComponentsJSONString === 'function') {
        const json = BlocklyPanel_getComponentsJSONString();
        const catalog = JSON.parse(json);
        return { success: true, components: catalog };
      }
      return { success: false, error: 'BlocklyPanel_getComponentsJSONString not available' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  function handle_get_component_schema(params) {
    try {
      if (typeof BlocklyPanel_getComponentInfo === 'function') {
        const info = BlocklyPanel_getComponentInfo(params.componentType);
        if (info) return { success: true, ...JSON.parse(info) };
      }
      return { success: false, error: `Unknown component type: ${params.componentType}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  function handle_search_components(params) {
    try {
      const query = (params.query || '').toLowerCase();
      if (typeof BlocklyPanel_getComponentsJSONString !== 'function') {
        return { success: false, error: 'Component catalog not available' };
      }
      const catalog = JSON.parse(BlocklyPanel_getComponentsJSONString());
      const matches = catalog.filter(c =>
        c.type.toLowerCase().includes(query) ||
        (c.category && c.category.toLowerCase().includes(query))
      );
      return { success: true, matches };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  function handle_take_screenshot() {
    // Can't easily screenshot from page context; return a stub
    return { success: false, error: 'Screenshot not available from page bridge (use Chrome DevTools)' };
  }

  function handle_reload_designer() {
    // Instead of location.reload() which kills WebSocket + session state,
    // try switching screens and back to force a designer refresh
    try {
      const currentScreen = typeof BlocklyPanel_getCurrentScreen === 'function'
        ? BlocklyPanel_getCurrentScreen() : null;

      if (currentScreen && typeof BlocklyPanel_switchScreen === 'function') {
        // Try to find another screen to switch to and back
        // This forces App Inventor to re-render the designer
        BlocklyPanel_switchScreen(currentScreen);
        return { success: true, method: 'screen_refresh', note: 'Designer refreshed via screen switch.' };
      }

      // Fallback: trigger a property toggle to force re-render
      if (typeof BlocklyPanel_setComponentProperty === 'function') {
        const screen = currentScreen || 'Screen1';
        const title = typeof BlocklyPanel_getComponentInstancePropertyValue === 'function'
          ? BlocklyPanel_getComponentInstancePropertyValue(screen, screen, 'Title') : screen;
        BlocklyPanel_setComponentProperty(screen, screen, 'Title', title + ' ', 'Title');
        setTimeout(() => {
          BlocklyPanel_setComponentProperty(screen, screen, 'Title', title, 'Title');
        }, 200);
        return { success: true, method: 'property_toggle', note: 'Triggered re-render via property toggle.' };
      }

      // Last resort: full reload (warns user)
      location.reload();
      return { success: true, method: 'full_reload', note: 'Full page reload — session params will need re-capture.' };
    } catch (err) {
      return { success: false, error: `reload error: ${err.message}` };
    }
  }

  function handle_clear_blocks(params) {
    try {
      const ws = Blockly.getMainWorkspace();
      if (!ws) return { success: false, error: 'Workspace not available' };

      if (params.blockIds && params.blockIds.length > 0) {
        let removed = 0;
        for (const id of params.blockIds) {
          const block = ws.getBlockById(id);
          if (block) { block.dispose(true); removed++; }
        }
        return { success: true, blocksRemoved: removed };
      }

      const count = ws.getAllBlocks(false).length;
      ws.clear();
      return { success: true, blocksRemoved: count };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  function handle_modify_block(params) {
    try {
      const ws = Blockly.getMainWorkspace();
      const block = ws.getBlockById(params.blockId);
      if (!block) return { success: false, error: `Block ${params.blockId} not found` };
      block.setFieldValue(params.newValue, params.fieldName);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  function handle_undo(params) {
    try {
      const ws = Blockly.getMainWorkspace();
      const steps = params.steps || 1;
      for (let i = 0; i < steps; i++) ws.undo(false);
      return { success: true, remainingUndos: ws.undoStack_.length, remainingRedos: ws.redoStack_.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  function handle_redo(params) {
    try {
      const ws = Blockly.getMainWorkspace();
      const steps = params.steps || 1;
      for (let i = 0; i < steps; i++) ws.undo(true);
      return { success: true, remainingUndos: ws.undoStack_.length, remainingRedos: ws.redoStack_.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // --- Helpers ---

  const COMPONENT_VERSIONS = {
    // UI
    Form: '31', Button: '7', Label: '5', TextBox: '6', PasswordTextBox: '5',
    CheckBox: '3', Switch: '2', Slider: '2', Spinner: '2', ListPicker: '9',
    DatePicker: '4', TimePicker: '4', Image: '5', ListView: '6', WebViewer: '10',
    // Layout
    VerticalArrangement: '4', HorizontalArrangement: '4', TableArrangement: '2',
    // Media
    Camcorder: '2', Camera: '4', ImagePicker: '6', Player: '7', Sound: '4',
    SpeechRecognizer: '3', TextToSpeech: '5', VideoPlayer: '7',
    // Drawing & Animation
    Canvas: '14',
    // Maps
    Map: '7', Marker: '4', Circle: '2', LineString: '2', Polygon: '2', Rectangle: '2',
    // Sensors
    AccelerometerSensor: '5', LocationSensor: '4', OrientationSensor: '2',
    BarcodeScannerComponent: '2', NearField: '2', Pedometer: '3', ProximitySensor: '2',
    Clock: '4',
    // Social
    ContactPicker: '6', EmailPicker: '4', PhoneCall: '3', PhoneNumberPicker: '5',
    Sharing: '2', Texting: '5', Twitter: '5',
    // Storage
    TinyDB: '2', File: '4', CloudDB: '2', FirebaseDB: '3', FusiontablesControl: '4',
    // Connectivity
    Web: '7', ActivityStarter: '7', BluetoothClient: '8', BluetoothServer: '5',
    // Non-visible
    Notifier: '6'
  };

  function buildComponentNodes(specs, nextUuid) {
    const nodes = [];
    for (const spec of specs) {
      const node = {
        $Name: spec.name,
        $Type: spec.type,
        $Version: COMPONENT_VERSIONS[spec.type] || '1',
        Uuid: String(nextUuid++)
      };
      if (spec.properties) {
        for (const [k, v] of Object.entries(spec.properties)) {
          node[k] = String(v);
        }
      }
      if (spec.children && spec.children.length > 0) {
        node.$Components = buildComponentNodes(spec.children, nextUuid);
        nextUuid += countComponents(spec.children);
      }
      nodes.push(node);
    }
    return nodes;
  }

  // Find the highest UUID in an SCM tree to avoid conflicts when appending
  function getMaxUuid(node) {
    let max = parseInt(node.Uuid || '0', 10) || 0;
    if (node.$Components) {
      for (const child of node.$Components) {
        max = Math.max(max, getMaxUuid(child));
      }
    }
    return max;
  }

  function countComponents(specs) {
    let count = 0;
    for (const s of specs) {
      count++;
      if (s.children) count += countComponents(s.children);
    }
    return count;
  }

  function collectNames(specs) {
    const names = [];
    for (const s of specs) {
      names.push(s.name);
      if (s.children) names.push(...collectNames(s.children));
    }
    return names;
  }

  function structuredToXml(block) {
    // Handle next block chaining
    const nextXml = block.next ? `<next>${structuredToXml(block.next)}</next>` : '';

    switch (block.type) {
      // --- App Inventor Component Blocks ---
      case 'event_handler':
        return '<block type="component_event" x="50" y="50">' +
          `<mutation component_type="${block.componentType}" instance_name="${block.component}" event_name="${block.event}"></mutation>` +
          `<field name="COMPONENT_SELECTOR">${block.component}</field>` +
          (block.body ? '<statement name="DO">' + block.body.map(structuredToXml).join('') + '</statement>' : '') +
          '</block>';

      case 'set_property':
        return '<block type="component_set_get">' +
          `<mutation component_type="${block.componentType}" set_or_get="set" property_name="${block.property}" is_generic="false" instance_name="${block.component}"></mutation>` +
          `<field name="COMPONENT_SELECTOR">${block.component}</field>` +
          `<field name="PROP">${block.property}</field>` +
          (block.value ? `<value name="VALUE">${structuredToXml(block.value)}</value>` : '') +
          nextXml + '</block>';

      case 'get_property':
        return '<block type="component_set_get">' +
          `<mutation component_type="${block.componentType}" set_or_get="get" property_name="${block.property}" is_generic="false" instance_name="${block.component}"></mutation>` +
          `<field name="COMPONENT_SELECTOR">${block.component}</field>` +
          `<field name="PROP">${block.property}</field>` +
          '</block>';

      case 'call_method': {
        let xml = '<block type="component_method">' +
          `<mutation component_type="${block.componentType}" method_name="${block.method}" instance_name="${block.component}" is_generic="false"></mutation>` +
          `<field name="COMPONENT_SELECTOR">${block.component}</field>`;
        if (block.args) {
          block.args.forEach((arg, i) => { xml += `<value name="ARG${i}">${structuredToXml(arg)}</value>`; });
        }
        return xml + nextXml + '</block>';
      }

      // --- Variables ---
      case 'global_declaration':
        return '<block type="global_declaration" x="50" y="50">' +
          `<field name="NAME">${block.name}</field>` +
          (block.value ? `<value name="VALUE">${structuredToXml(block.value)}</value>` : '') +
          '</block>';

      case 'variable_get':
        return `<block type="lexical_variable_get"><field name="VAR">${block.variable || block.name}</field></block>`;

      case 'variable_set':
        return '<block type="lexical_variable_set">' +
          `<field name="VAR">${block.variable || block.name}</field>` +
          (block.value ? `<value name="VALUE">${structuredToXml(block.value)}</value>` : '') +
          nextXml + '</block>';

      // --- Control Flow ---
      case 'controls_if': {
        const elseifCount = block.elseif ? block.elseif.length : 0;
        const hasElse = !!block.else;
        let xml = `<block type="controls_if"><mutation elseif="${elseifCount}" else="${hasElse ? 1 : 0}"></mutation>`;
        // Primary if condition
        if (block.condition) xml += `<value name="IF0">${structuredToXml(block.condition)}</value>`;
        if (block.then) xml += `<statement name="DO0">${block.then.map(structuredToXml).join('')}</statement>`;
        // Elseif branches
        if (block.elseif) {
          block.elseif.forEach((branch, i) => {
            if (branch.condition) xml += `<value name="IF${i + 1}">${structuredToXml(branch.condition)}</value>`;
            if (branch.then) xml += `<statement name="DO${i + 1}">${branch.then.map(structuredToXml).join('')}</statement>`;
          });
        }
        // Else branch
        if (block.else) xml += `<statement name="ELSE">${block.else.map(structuredToXml).join('')}</statement>`;
        return xml + nextXml + '</block>';
      }

      case 'controls_forRange':
        return '<block type="controls_forRange">' +
          `<field name="VAR">${block.variable || 'i'}</field>` +
          (block.from ? `<value name="START">${structuredToXml(block.from)}</value>` : '') +
          (block.to ? `<value name="END">${structuredToXml(block.to)}</value>` : '') +
          (block.by ? `<value name="STEP">${structuredToXml(block.by)}</value>` : '') +
          (block.body ? `<statement name="DO">${block.body.map(structuredToXml).join('')}</statement>` : '') +
          nextXml + '</block>';

      case 'controls_forEach':
        return '<block type="controls_forEach">' +
          `<field name="VAR">${block.variable || 'item'}</field>` +
          (block.list ? `<value name="LIST">${structuredToXml(block.list)}</value>` : '') +
          (block.body ? `<statement name="DO">${block.body.map(structuredToXml).join('')}</statement>` : '') +
          nextXml + '</block>';

      case 'controls_while':
        return '<block type="controls_while">' +
          (block.condition ? `<value name="TEST">${structuredToXml(block.condition)}</value>` : '') +
          (block.body ? `<statement name="DO">${block.body.map(structuredToXml).join('')}</statement>` : '') +
          nextXml + '</block>';

      // --- Logic ---
      case 'logic_compare':
        return '<block type="logic_compare">' +
          `<field name="OP">${block.op || 'EQ'}</field>` +
          (block.a ? `<value name="A">${structuredToXml(block.a)}</value>` : '') +
          (block.b ? `<value name="B">${structuredToXml(block.b)}</value>` : '') +
          '</block>';

      case 'logic_operation':
        return '<block type="logic_operation">' +
          `<field name="OP">${block.op || 'AND'}</field>` +
          (block.a ? `<value name="A">${structuredToXml(block.a)}</value>` : '') +
          (block.b ? `<value name="B">${structuredToXml(block.b)}</value>` : '') +
          '</block>';

      case 'logic_negate':
        return '<block type="logic_negate">' +
          (block.value ? `<value name="BOOL">${structuredToXml(block.value)}</value>` : '') +
          '</block>';

      // --- Math ---
      case 'math_arithmetic':
        return '<block type="math_arithmetic">' +
          `<field name="OP">${block.op || 'ADD'}</field>` +
          (block.a ? `<value name="A">${structuredToXml(block.a)}</value>` : '') +
          (block.b ? `<value name="B">${structuredToXml(block.b)}</value>` : '') +
          '</block>';

      case 'math_compare':
        return '<block type="math_compare">' +
          `<field name="OP">${block.op || 'EQ'}</field>` +
          (block.a ? `<value name="A">${structuredToXml(block.a)}</value>` : '') +
          (block.b ? `<value name="B">${structuredToXml(block.b)}</value>` : '') +
          '</block>';

      // --- Text ---
      case 'text_join': {
        const items = block.items || [];
        let xml = `<block type="text_join"><mutation items="${items.length}"></mutation>`;
        items.forEach((item, i) => { xml += `<value name="ADD${i}">${structuredToXml(item)}</value>`; });
        return xml + '</block>';
      }

      // --- Lists ---
      case 'lists_create_with': {
        const listItems = block.items || [];
        let xml = `<block type="lists_create_with"><mutation items="${listItems.length}"></mutation>`;
        listItems.forEach((item, i) => { xml += `<value name="ADD${i}">${structuredToXml(item)}</value>`; });
        return xml + '</block>';
      }

      case 'lists_add_items':
        return '<block type="lists_add_items">' +
          (block.list ? `<value name="LIST">${structuredToXml(block.list)}</value>` : '') +
          (block.item ? `<value name="ITEM">${structuredToXml(block.item)}</value>` : '') +
          nextXml + '</block>';

      // --- Procedures ---
      case 'procedures_defnoreturn': {
        let xml = '<block type="procedures_defnoreturn" x="50" y="50">' +
          `<field name="NAME">${block.name}</field>`;
        if (block.params && block.params.length > 0) {
          xml += `<mutation><arg name="${block.params.join('"></arg><arg name="')}"></arg></mutation>`;
        }
        if (block.body) xml += `<statement name="STACK">${block.body.map(structuredToXml).join('')}</statement>`;
        return xml + '</block>';
      }

      case 'procedures_defreturn': {
        let xml = '<block type="procedures_defreturn" x="50" y="50">' +
          `<field name="NAME">${block.name}</field>`;
        if (block.params && block.params.length > 0) {
          xml += `<mutation><arg name="${block.params.join('"></arg><arg name="')}"></arg></mutation>`;
        }
        if (block.body) xml += `<statement name="STACK">${block.body.map(structuredToXml).join('')}</statement>`;
        if (block.returnValue) xml += `<value name="RETURN">${structuredToXml(block.returnValue)}</value>`;
        return xml + '</block>';
      }

      case 'procedures_callnoreturn': {
        let xml = '<block type="procedures_callnoreturn">' +
          `<mutation name="${block.name}">`;
        if (block.args) block.args.forEach(a => { xml += `<arg name="${a.name}"></arg>`; });
        xml += '</mutation>';
        if (block.args) block.args.forEach((a, i) => { xml += `<value name="ARG${i}">${structuredToXml(a.value)}</value>`; });
        return xml + nextXml + '</block>';
      }

      case 'procedures_callreturn': {
        let xml = '<block type="procedures_callreturn">' +
          `<mutation name="${block.name}">`;
        if (block.args) block.args.forEach(a => { xml += `<arg name="${a.name}"></arg>`; });
        xml += '</mutation>';
        if (block.args) block.args.forEach((a, i) => { xml += `<value name="ARG${i}">${structuredToXml(a.value)}</value>`; });
        return xml + '</block>';
      }

      // --- Primitives ---
      case 'text':
        return `<block type="text"><field name="TEXT">${escapeXml(block.value || '')}</field></block>`;
      case 'number':
        return `<block type="math_number"><field name="NUM">${block.value || 0}</field></block>`;
      case 'boolean':
        return `<block type="logic_boolean"><field name="BOOL">${block.value ? 'TRUE' : 'FALSE'}</field></block>`;
      case 'color':
        return `<block type="color_make_color"><value name="COLORLIST">${structuredToXml(block.value)}</value></block>`;
      case 'empty_string':
        return '<block type="text"><field name="TEXT"></field></block>';

      default:
        // Allow raw block type passthrough for anything not covered
        if (block.rawType) {
          let xml = `<block type="${block.rawType}">`;
          if (block.fields) {
            for (const [name, val] of Object.entries(block.fields)) {
              xml += `<field name="${name}">${val}</field>`;
            }
          }
          if (block.values) {
            for (const [name, val] of Object.entries(block.values)) {
              xml += `<value name="${name}">${structuredToXml(val)}</value>`;
            }
          }
          if (block.statements) {
            for (const [name, stmts] of Object.entries(block.statements)) {
              xml += `<statement name="${name}">${stmts.map(structuredToXml).join('')}</statement>`;
            }
          }
          return xml + nextXml + '</block>';
        }
        console.warn('[MCP Bridge] Unknown structured block type:', block.type);
        return '';
    }
  }

  // Escape XML special characters in text values
  function escapeXml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // --- Router ---
  const TOOL_HANDLERS = {
    get_project_info: handle_get_project_info,
    get_component_tree: handle_get_component_tree,
    get_component_schema: handle_get_component_schema,
    get_all_component_types: handle_get_all_component_types,
    get_blocks: handle_get_blocks,
    get_block_diagnostics: handle_get_block_diagnostics,
    search_components: handle_search_components,
    add_components: handle_add_components,
    add_blocks: handle_add_blocks,
    clear_blocks: handle_clear_blocks,
    modify_block: handle_modify_block,
    take_screenshot: handle_take_screenshot,
    reload_designer: handle_reload_designer,
    undo: handle_undo,
    redo: handle_redo,
    update_component_properties: handle_update_component_properties,
    remove_components: handle_remove_components
  };

  // --- Message listener ---
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== `${BRIDGE_PREFIX}request`) return;

    const { requestId, tool, params } = event.data;

    const handler = TOOL_HANDLERS[tool];
    if (!handler) {
      window.postMessage({ type: `${BRIDGE_PREFIX}response`, requestId, result: { success: false, error: `Unknown tool: ${tool}` } }, '*');
      return;
    }

    Promise.resolve()
      .then(() => handler(params || {}))
      .then((result) => {
        window.postMessage({ type: `${BRIDGE_PREFIX}response`, requestId, result }, '*');
      })
      .catch((err) => {
        window.postMessage({ type: `${BRIDGE_PREFIX}response`, requestId, result: { success: false, error: `Tool error: ${err.message}` } }, '*');
      });
  });

  // Extract GWT permutation hash on load
  extractGwtPermutation();

  // --- Cache-first: load cached session params on startup ---
  window.addEventListener('message', function cacheListener(event) {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== BRIDGE_PREFIX + 'cache-data') return;

    const data = event.data.data;
    if (data) {
      if (data.sessionUuid) capturedSessionUuid = data.sessionUuid;
      if (data.gwtHash) capturedGwtHash = data.gwtHash;
      if (data.filePath) capturedFilePath = data.filePath;
      if (data.base36) capturedBase36 = data.base36;
      if (data.scmJson) capturedScmJson = data.scmJson;
      if (data.rpcTemplate) capturedRpcTemplate = data.rpcTemplate;
      console.log('[MCP Bridge] Loaded cached session params:', {
        sessionUuid: !!capturedSessionUuid, gwtHash: !!capturedGwtHash,
        filePath: !!capturedFilePath, base36: !!capturedBase36,
        hasScm: !!capturedScmJson, hasTemplate: !!capturedRpcTemplate
      });
    } else {
      console.log('[MCP Bridge] No cached session params found');
    }
    // Remove one-time listener
    window.removeEventListener('message', cacheListener);
  });

  // Request cached params from content script
  window.postMessage({ type: BRIDGE_PREFIX + 'cache-read' }, '*');

  // Auto-capture session params on load if not cached
  // Wait for App Inventor to fully load, then force a save2 to capture params
  function autoCapture() {
    if (capturedScmJson && capturedRpcTemplate) {
      console.log('[MCP Bridge] Session params already available, skipping auto-capture');
      return;
    }
    // Check if App Inventor is ready
    if (typeof BlocklyPanel_setComponentProperty !== 'function') {
      // Not ready yet, retry
      console.log('[MCP Bridge] App Inventor not ready, retrying auto-capture in 3s...');
      setTimeout(autoCapture, 3000);
      return;
    }
    console.log('[MCP Bridge] Auto-capturing session params...');
    forceSave2Capture().then((success) => {
      if (success) {
        console.log('[MCP Bridge] Auto-capture successful');
      } else {
        console.log('[MCP Bridge] Auto-capture failed, will capture on first tool call');
      }
    });
  }
  // Start auto-capture after a delay to let App Inventor initialize
  setTimeout(autoCapture, 4000);

  // Expose tool dispatch globally so background can call via executeScript
  window.__mcpBridge = async function(tool, params) {
    const handler = TOOL_HANDLERS[tool];
    if (!handler) return { success: false, error: `Unknown tool: ${tool}` };
    try {
      return await handler(params || {});
    } catch (err) {
      return { success: false, error: `Tool error: ${err.message}` };
    }
  };

  console.log('[MCP Bridge] Page bridge loaded, tools ready');
})();
