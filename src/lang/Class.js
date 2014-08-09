var Any = require('../Any.js').Any;

var isString = require('./common/typeCheck.js').isString;
var isFunction = require('./common/typeCheck.js').isFunction;

var init = require('./Trait').init;
var extendz = require('./Trait').extendz;
var withz = require('./Trait').withz;
var body = require('./Trait').body;

// duplicate
function getName(fn) {
  // TODO: Cross-browser?
  return fn.name;
}

function ClassBuilder(Ctor) {
  init.call(this, function Class() {
  }, Ctor);
}

ClassBuilder.prototype = {
  extendz: function (parent) {
    return extendz.call(this, parent);
  },

  withz: function (trt) {
    return withz.call(this, trt);
  },

  body: function (obj) {
    return body.call(this, obj);
  },

  // Aliases

  'extends': function (Parent) {
    return this.extendz(Parent);
  },

  'with': function (trt) {
    return this.withz(trt);
  }
};

function Class(Ctor) {
  return new ClassBuilder(Ctor);
}

exports.Class = Class;
