function extend(obj, by) {
  by = by || {};
  Object.keys(by).forEach(function (key) {
    obj[key] = by[key];
  });
  return obj;
}

exports.extend = extend;
