var caseClassify = require('./common/caseClassify.js').caseClassify;

var init = require('./Trait').init;
var extendz = require('./Trait').extendz;
var withz = require('./Trait').withz;
var body = require('./Trait').body;

var isFunction = require('./common/typeCheck.js').isFunction;

function CaseSingletonBuilder(Ctor, defaults) {
  if (isFunction(Ctor) && Ctor.length !== 0) {
    console.warn('Case Singletons can not have constructor arguments.');
  }
  if (defaults) {
    console.warn('Case Singletons can not have default values');
  }
  
  init.call(this, function CaseSingleton() {
  }, Ctor);
}

CaseSingletonBuilder.prototype = {
  extendz: function (parent) {
    return extendz.call(this, parent);
  },

  withz: function (trt) {
    return withz.call(this, trt);
  },

  body: function (obj) {
    var Ctor = body.call(this, obj);
    Ctor = caseClassify(Ctor, this.name);
    Ctor.instance = new Ctor();
    return Ctor.instance;
  },

  // Aliases

  'extends': function (Parent) {
    return this.extendz(Parent);
  },

  'with': function (trt) {
    return this.withz(trt);
  }
};

function CaseSingleton(Ctor) {
  return new CaseSingletonBuilder(Ctor);
}

exports.CaseSingleton = CaseSingleton;

