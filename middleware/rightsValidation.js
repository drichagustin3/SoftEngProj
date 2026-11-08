const { modules } = require('../config/rights');
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const onlyKeys = (value, keys) => Object.keys(value).every(key => keys.includes(key));
const selection = (module, all) => ({
  module: module.module, enabled: all, actions: all ? [...module.actions] : [],
});

exports.validateRightsUserId = (req, res, next) => {
  if (!/^[1-9]\d*$/.test(req.params.id) || Number(req.params.id) > 2147483647) {
    return res.status(400).json({ message: 'User ID must be a positive PostgreSQL integer.' });
  }
  return next();
};

exports.validateRightsChange = (req, res, next) => {
  const reject = message => res.status(400).json({ message });
  const body = req.body;
  if (!isObject(body)) return reject('Request body must be a JSON object.');
  if (Object.hasOwn(body, 'selection')) {
    if (!onlyKeys(body, ['selection']) || !['all', 'none'].includes(body.selection)) {
      return reject('Global selection must be all or none, without other fields.');
    }
    req.rightsChanges = modules.map(module => selection(module, body.selection === 'all'));
    return next();
  }
  if (!onlyKeys(body, ['modules']) || !Array.isArray(body.modules) ||
      body.modules.length === 0 || body.modules.length > modules.length) {
    return reject('Provide between one and five module changes.');
  }
  const changes = [];
  const seen = new Set();
  for (const item of body.modules) {
    if (!isObject(item) || !onlyKeys(item, ['module', 'enabled', 'actions', 'selection'])) {
      return reject('Each module change must contain supported fields only.');
    }
    const module = modules.find(entry => entry.module === item.module);
    if (!module || seen.has(item.module)) return reject('Unknown or duplicate module.');
    seen.add(item.module);
    if (Object.hasOwn(item, 'selection')) {
      if (!onlyKeys(item, ['module', 'selection']) || !['all', 'none'].includes(item.selection)) {
        return reject('Module selection must be all or none, without enabled/actions.');
      }
      changes.push(selection(module, item.selection === 'all'));
      continue;
    }
    if (typeof item.enabled !== 'boolean' ||
        (item.actions !== undefined && !isObject(item.actions))) {
      return reject('Module enabled must be boolean, and actions must be an object.');
    }
    const actions = item.actions || {};
    if (!onlyKeys(actions, module.actions) || Object.values(actions).some(value => typeof value !== 'boolean')) {
      return reject(`Unsupported action or nonboolean value for ${module.module}.`);
    }
    const allowed = module.actions.filter(action => actions[action] === true);
    if (!item.enabled && allowed.length) return reject('A disabled module cannot grant actions.');
    changes.push({ module: module.module, enabled: item.enabled, actions: allowed });
  }
  req.rightsChanges = changes;
  return next();
};
