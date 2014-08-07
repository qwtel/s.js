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
  withz: function (Trait) {
    extend(this.Ctor.prototype, Trait.prototype);
    return this;
  },
  
  'with': function (Trait) {
    return this.withz(Trait);
  },
  
  extendz: function (Trait) {
    this.Ctor.prototype = Object.create(Trait.prototype);

    if (!Trait.__Any__) {
      extend(this.Ctor.prototype, Any.prototype);
    }

    this.Ctor.prototype['__' + this.name + '__'] = true;
    
    // TODO: WithTraitTraitBuilder
    return this;
  },
  
  'extends': function (Trait) {
    return this.extendz(Trait);
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
