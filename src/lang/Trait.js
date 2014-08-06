var extend = require('./common/extend.js').extend;

function TraitBuilder(name) {
  this.trt = {};
  this.trt.name = name;
  this.trt['__' + name + '__'] = true;
}

TraitBuilder.prototype = {
  with: function (body) {
    extend(this.trt, body);
    return this;
  },

  body: function (body) {
    body = body || {};
    extend(this.trt, body);
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
