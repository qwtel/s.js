var init = require('./Trait').init;
var extendz = require('./Trait').extendz;
var withz = require('./Trait').withz;
var body = require('./Trait').body;

var isFunction = require('./common/typeCheck.js').isFunction;

function SingletonBuilder(Ctor) {
  if (isFunction(Ctor) && Ctor.length !== 0) {
    console.warn('Singletons can not have constructor arguments.');
  }
  init.call(this, function Singleton() {
  }, Ctor);
}

SingletonBuilder.prototype = {
  extendz: function (parent) {
    return extendz.call(this, parent);
  },

  withz: function (trt) {
    return withz.call(this, trt);
  },

  body: function (obj) {
    var Ctor = body.call(this, obj);
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

function Singleton(Ctor) {
  return new SingletonBuilder(Ctor);
}

exports.Singleton = Singleton;
