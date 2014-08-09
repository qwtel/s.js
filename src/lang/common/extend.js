function extend(obj, by) {
  by = by || {};
  Object.keys(by).forEach(function (key) {
    obj[key] = by[key];
  });
  return obj;
}

function extendComplete(obj, by) {
  by = by || {};
  for (var key in by) {
    obj[key] = by[key];
  }
  return obj;
}

exports.extend = extend;
exports.extendComplete = extendComplete;
