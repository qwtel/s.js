var Any = require('../Any.js').Any;

var extend = require('./common/extend.js').extend;
var isFunction = require('./common/typeCheck.js').isFunction;

function TraitBuilder(name) {
  if (isFunction(name)) {
    this.Ctor = name;
    name = name.name;
  }
  else {
    this.Ctor = function Trait() {
    };
    this.Ctor.prototype = Object.create(Any.prototype);
  }

  this.Ctor.prototype.name = name;
  this.Ctor.prototype['__' + name + '__'] = true;
}

TraitBuilder.prototype = {
  withz: function (trt) {
    if (isFunction(trt)) { // Traits are functions
      extend(this.Ctor.prototype, trt.prototype);
      return this;
    } else {
      return this.body(trt);
    }
  },
  
  'with': function (trt) {
    return this.withz(trt);
  },
  
  extendz: function (trt) {
    this.Ctor.prototype = Object.create(trt.prototype);

    if (!trt.__Any__) {
      extend(this.Ctor.prototype, Any.prototype);
    }

    this.Ctor.prototype['__' + this.name + '__'] = true;
    
    // TODO: WithTraitTraitBuilder
    return this;
  },
  
  'extends': function (trt) {
    return this.extendz(trt);
  },
  
  body: function (body) {
    body = body || {};
    extend(this.Ctor.prototype, body);
    return this.Ctor;
  }
};

function Trait(name, body) {
  var traitBuilder = new TraitBuilder(name);
  return body ? traitBuilder.body(body) : traitBuilder;
}

Trait.required = function () {
  throw new Error("Not implemented");
};

exports.Trait = Trait;
