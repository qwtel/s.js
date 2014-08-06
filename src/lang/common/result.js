var isFunction = require('./typeCheck.js').isFunction;

function result(value, context) {
  return isFunction(value) ? value.call(context) : value;
}

exports.result = result;
