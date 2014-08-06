var caseClassify = require('./common/caseClassify.js').caseClassify;
var equals = require('./common/equals.js').equals;
var extend = require('./common/extend.js').extend;
var match = require('./common/match.js').match;
var result = require('./common/result.js').result;
var isFunction = require('./common/typeCheck.js').isFunction;
var isObject = require('./common/typeCheck.js').isObject;
var wrap = require('./common/wrap.js').wrap;

var common = {
  caseClassify: caseClassify,
  equals: equals,
  extend: extend,
  match: match,
  result: result,
  isFunction: isFunction,
  isObject: isObject,
  wrap: wrap
};

module.exports = common;
