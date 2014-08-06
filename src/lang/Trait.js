var extend = require('./common/extend.js').extend;
var isFunction = require('./common/typeCheck.js').isFunction;

function TraitBuilder(name) {
  if (isFunction(name)) {
    this.trt = name;
    name = name.name;
  }
  else {
    this.trt = function Trait() {
    };
  }

  this.trt.prototype.name = name;
  this.trt.prototype['__' + name + '__'] = true;
}

TraitBuilder.prototype = {
  with: function (trt) {
    extend(this.trt.prototype, trt.prototype);
    return this;
  },

  body: function (body) {
    body = body || {};
    extend(this.trt.prototype, body);
    return this.trt;
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
