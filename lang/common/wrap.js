var extend = require('./extend.js').extend;
var isFunction = require('./typeCheck.js').isFunction;

function wrap(target) {
  function Wrapped () {
    return target.app.apply(target, arguments);
  }
  
  Object.keys(target).forEach(function (key) {
    var value = target[key];
    if (isFunction(value)) {
      Wrapped[key] = value.bind(target);
    } else {
      Wrapped[key] = value;
    }
  });

  return Wrapped;
}

exports.wrap = wrap;
