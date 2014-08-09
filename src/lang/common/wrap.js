var extend = require('./extend.js').extend;
var isFunction = require('./typeCheck.js').isFunction;

function wrap(target, Class) {
  function Obj () {
    return target.app.apply(target, arguments);
  }
  
  if (Class) {
    Obj.prototype = Class.prototype;
  }
  
  Object.keys(target).forEach(function (key) {
    var value = target[key];
    if (isFunction(value)) {
      Obj[key] = value.bind(target);
    } else {
      Obj[key] = value;
    }
  });

  return Obj;
}

exports.wrap = wrap;
