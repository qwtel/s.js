var caseClassify = require('./common/caseClassify.js').caseClassify;

var isFunction = require('./common/typeCheck.js').isFunction;
var isString = require('./common/typeCheck.js').isString;
var isArray = require('./common/typeCheck.js').isArray;
var isObject = require('./common/typeCheck.js').isObject;

var init = require('./Trait').init;
var extendz = require('./Trait').extendz;
var withz = require('./Trait').withz;
var body = require('./Trait').body;

function getName(fn) {
  // TODO: Cross-browser?
  return fn.name;
}

function CaseClassBuilder(Ctor, defaults) {
  init.call(this, function CaseClass() {
  }, Ctor);

  if (defaults) {
    if (isObject(defaults)) {
      this.defaults = defaults;
    } else {
      throw new Error("Invalid case class construction. Second parameter must be an object of default values.")
    }
  }
}

CaseClassBuilder.prototype = {
  extendz: function (parent) {
    return extendz.call(this, parent);
  },

  withz: function (trt) {
    return withz.call(this, trt);
  },

  body: function (obj) {
    var Ctor = body.call(this, obj);
    return caseClassify(Ctor, this.name, this.defaults);
  },

  // Aliases

  'extends': function (Parent) {
    return this.extendz(Parent);
  },

  'with': function (trt) {
    return this.withz(trt);
  }
};

function CaseClass(Ctor, defaults) {
  return new CaseClassBuilder(Ctor, defaults);
}

exports.CaseClass = CaseClass;
