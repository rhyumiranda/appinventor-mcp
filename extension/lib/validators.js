export function validateAddComponents(params) {
  if (!params.components || !Array.isArray(params.components) || params.components.length === 0) {
    return { valid: false, error: 'components array is required and must not be empty' };
  }

  const names = new Set();

  function checkComponent(spec) {
    if (!spec.type) {
      return { valid: false, error: `Component missing required "type" field` };
    }
    if (!spec.name) {
      return { valid: false, error: `Component missing required "name" field` };
    }
    if (names.has(spec.name)) {
      return { valid: false, error: `duplicate component name: "${spec.name}"` };
    }
    names.add(spec.name);

    if (spec.children) {
      for (const child of spec.children) {
        const childResult = checkComponent(child);
        if (!childResult.valid) return childResult;
      }
    }

    return { valid: true };
  }

  for (const spec of params.components) {
    const result = checkComponent(spec);
    if (!result.valid) return result;
  }

  return { valid: true };
}

export function validateAddBlocks(params) {
  if (!params.xml && (!params.blocks || params.blocks.length === 0)) {
    return { valid: false, error: 'Either xml or blocks must be provided' };
  }

  if (params.xml && !params.xml.includes('<xml')) {
    return { valid: false, error: 'xml must contain a root <xml> element' };
  }

  return { valid: true };
}
