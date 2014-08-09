function extend(obj, by) {
  by = by || {};
  for (var key in by) {
    obj[key] = by[key];
  }
  return obj;
}

exports.extend = extend;
