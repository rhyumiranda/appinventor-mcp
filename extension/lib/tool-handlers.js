import { mergeComponents, wrapScmContent } from './scm-builder.js';
import { buildSave2Request, projectIdToBase36 } from './gwt-rpc.js';
import { buildEventHandler, buildSetProperty, buildCallMethod, blocksToXml } from './bky-builder.js';

function collectComponentNames(specs) {
  const names = [];
  for (const spec of specs) {
    names.push(spec.name);
    if (spec.children) names.push(...collectComponentNames(spec.children));
  }
  return names;
}

export async function handle_get_project_info(params, pageApi) {
  try {
    const projectId = pageApi.call('HTML5DragDrop_getOpenProjectId');
    const projectName = pageApi.call('BlocklyPanel_getProjectName');
    const isEditorOpen = pageApi.call('isEditorOpen');
    const isBlocksEditorOpen = pageApi.call('isBlocksEditorOpen');
    const currentScreen = pageApi.call('BlocklyPanel_getCurrentScreen');

    return {
      success: true,
      projectId,
      projectName,
      isEditorOpen,
      isBlocksEditorOpen,
      currentScreen
    };
  } catch (err) {
    return { success: false, error: `Not on App Inventor page: ${err.message}` };
  }
}

export async function handle_get_component_tree(params, pageApi) {
  try {
    const screenName = params.screenName || 'Screen1';
    const scmJson = pageApi.call('getComponentTree', { screenName });
    const scm = JSON.parse(scmJson);

    return { success: true, scm };
  } catch (err) {
    return { success: false, error: `Failed to read component tree: ${err.message}` };
  }
}

export async function handle_add_components(params, pageApi) {
  try {
    const screenName = params.screenName || 'Screen1';

    // Read current tree
    const scmJson = pageApi.call('getComponentTree', { screenName });
    const existingScm = JSON.parse(scmJson);

    // Merge new components
    const merged = mergeComponents(existingScm, params.components);

    // Get session params for save2
    const sessionParams = pageApi.call('getSessionParams');
    const projectId = pageApi.call('HTML5DragDrop_getOpenProjectId');
    const scmContent = wrapScmContent(merged);

    // Save via GWT-RPC
    const rpcBody = buildSave2Request({
      ...sessionParams,
      scmContent,
      projectId
    });

    pageApi.call('save2', { rpcBody, scm: merged });

    // Reload designer
    pageApi.call('reload');

    return {
      success: true,
      componentsAdded: collectComponentNames(params.components),
      reloadRequired: true
    };
  } catch (err) {
    return { success: false, error: `Failed to add components: ${err.message}` };
  }
}

export async function handle_get_blocks(params, pageApi) {
  try {
    const format = params.format || 'xml';

    if (format === 'summary') {
      const summary = pageApi.call('getBlocksSummary');
      return { success: true, ...summary };
    }

    const xml = pageApi.call('getBlocksXml');
    return { success: true, xml };
  } catch (err) {
    return { success: false, error: `Failed to get blocks: ${err.message}` };
  }
}

function structuredBlockToXml(block) {
  switch (block.type) {
    case 'event_handler':
      return buildEventHandler({
        componentType: block.componentType,
        instanceName: block.component,
        eventName: block.event,
        body: block.body ? block.body.map(structuredBlockToXml).join('') : undefined
      });
    case 'set_property':
      return buildSetProperty({
        componentType: block.componentType,
        instanceName: block.component,
        propertyName: block.property,
        value: block.value ? structuredBlockToXml(block.value) : undefined
      });
    case 'call_method':
      return buildCallMethod({
        componentType: block.componentType,
        instanceName: block.component,
        methodName: block.method,
        args: block.args ? block.args.map(structuredBlockToXml) : []
      });
    default:
      return '';
  }
}

export async function handle_add_blocks(params, pageApi) {
  try {
    let xml = params.xml;

    // Convert structured descriptions to XML if needed
    if (!xml && params.blocks) {
      const blockXmls = params.blocks.map(structuredBlockToXml);
      xml = blocksToXml(blockXmls);
    }

    // Disable Blockly events for batch injection
    pageApi.call('disableBlocklyEvents');

    let result;
    try {
      result = pageApi.call('injectBlocksXml', { xml });
    } finally {
      pageApi.call('enableBlocklyEvents');
    }

    return {
      success: true,
      blocksAdded: result.blocksAdded,
      warnings: result.warnings || []
    };
  } catch (err) {
    return { success: false, error: `Failed to add blocks: ${err.message}` };
  }
}

export async function handle_get_component_schema(params, pageApi) {
  try {
    const info = pageApi.call('getComponentInfo', { componentType: params.componentType });
    return { success: true, ...info };
  } catch (err) {
    return { success: false, error: `Failed to get schema: ${err.message}` };
  }
}

export async function handle_get_all_component_types(params, pageApi) {
  try {
    const components = pageApi.call('getAllComponentTypes');
    return { success: true, components };
  } catch (err) {
    return { success: false, error: `Failed to get component types: ${err.message}` };
  }
}

export async function handle_search_components(params, pageApi) {
  try {
    const matches = pageApi.call('searchComponents', { query: params.query });
    return { success: true, matches };
  } catch (err) {
    return { success: false, error: `Failed to search: ${err.message}` };
  }
}

export async function handle_get_block_diagnostics(params, pageApi) {
  try {
    const diagnostics = pageApi.call('getBlockDiagnostics');
    return { success: true, ...diagnostics };
  } catch (err) {
    return { success: false, error: `Failed to get diagnostics: ${err.message}` };
  }
}

function findComponent(node, name) {
  if (node.$Name === name) return node;
  if (node.$Components) {
    for (const child of node.$Components) {
      const found = findComponent(child, name);
      if (found) return found;
    }
  }
  return null;
}

function removeFromTree(node, names) {
  if (!node.$Components) return;
  node.$Components = node.$Components.filter(c => !names.includes(c.$Name));
  for (const child of node.$Components) {
    removeFromTree(child, names);
  }
}

async function saveAndReload(scm, pageApi) {
  const sessionParams = pageApi.call('getSessionParams');
  const projectId = pageApi.call('HTML5DragDrop_getOpenProjectId');
  const scmContent = wrapScmContent(scm);
  const rpcBody = buildSave2Request({ ...sessionParams, scmContent, projectId });
  pageApi.call('save2', { rpcBody, scm });
  pageApi.call('reload');
}

export async function handle_update_component_properties(params, pageApi) {
  try {
    const screenName = params.screenName || 'Screen1';
    const scmJson = pageApi.call('getComponentTree', { screenName });
    const scm = JSON.parse(scmJson);

    const component = findComponent(scm.Properties, params.componentName);
    if (!component) {
      return { success: false, error: `Component "${params.componentName}" not found` };
    }

    const updatedProperties = [];
    for (const [key, value] of Object.entries(params.properties)) {
      component[key] = String(value);
      updatedProperties.push(key);
    }

    await saveAndReload(scm, pageApi);

    return { success: true, updatedProperties };
  } catch (err) {
    return { success: false, error: `Failed to update properties: ${err.message}` };
  }
}

export async function handle_remove_components(params, pageApi) {
  try {
    const screenName = params.screenName || 'Screen1';
    const scmJson = pageApi.call('getComponentTree', { screenName });
    const scm = JSON.parse(scmJson);

    removeFromTree(scm.Properties, params.componentNames);

    await saveAndReload(scm, pageApi);

    return { success: true, removedComponents: params.componentNames };
  } catch (err) {
    return { success: false, error: `Failed to remove components: ${err.message}` };
  }
}

export async function handle_clear_blocks(params, pageApi) {
  try {
    const result = pageApi.call('clearBlocks', { blockIds: params.blockIds });
    return { success: true, blocksRemoved: result.blocksRemoved };
  } catch (err) {
    return { success: false, error: `Failed to clear blocks: ${err.message}` };
  }
}

export async function handle_modify_block(params, pageApi) {
  try {
    pageApi.call('modifyBlock', {
      blockId: params.blockId,
      fieldName: params.fieldName,
      newValue: params.newValue
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: `Failed to modify block: ${err.message}` };
  }
}

export async function handle_take_screenshot(params, pageApi) {
  try {
    const result = pageApi.call('takeScreenshot', { area: params.area });
    return { success: true, imageData: result.imageData };
  } catch (err) {
    return { success: false, error: `Failed to take screenshot: ${err.message}` };
  }
}

export async function handle_undo(params, pageApi) {
  try {
    const result = pageApi.call('undo', { steps: params.steps });
    return { success: true, remainingUndos: result.remainingUndos, remainingRedos: result.remainingRedos };
  } catch (err) {
    return { success: false, error: `Failed to undo: ${err.message}` };
  }
}

export async function handle_redo(params, pageApi) {
  try {
    const result = pageApi.call('redo', { steps: params.steps });
    return { success: true, remainingUndos: result.remainingUndos, remainingRedos: result.remainingRedos };
  } catch (err) {
    return { success: false, error: `Failed to redo: ${err.message}` };
  }
}

export async function handle_reload_designer(params, pageApi) {
  try {
    const result = pageApi.call('reloadDesigner');
    return { success: true, loadTime: result.loadTime };
  } catch (err) {
    return { success: false, error: `Failed to reload designer: ${err.message}` };
  }
}
