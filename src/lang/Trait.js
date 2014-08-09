var Any = require('../Any.js').Any;

var isFunction = require('./common/typeCheck.js').isFunction;
var isString = require('./common/typeCheck.js').isString;

// duplicate
function getName(fn) {
  // TODO: fn.name is not always available?
  return fn.__name__ ? fn.__name__ : fn.name;
}

function extendProto(trt) {
  for (var key in trt.prototype) {
    var prop = trt.prototype[key];
    if (prop !== Trait.required) {
      this.Ctor.prototype[key] = prop;
    }
  }
}

function extendObj(obj) {
  Object.keys(obj).forEach(function (key) {
    this.Ctor.prototype[key] = obj[key];
  }, this);
}

function init(DefaultCtor, Ctor) {
  if (isFunction(Ctor)) {
    this.Ctor = Ctor;
    this.name = getName(Ctor);
  } else if (isString(Ctor)) {
    this.Ctor = DefaultCtor;
    this.name = Ctor
  } else {
    throw new Error("Invalid class construction. First parameter must be a class constructor (function) or a class name (string).")
  }

  this.Ctor.__name__ = this.name;
  this.Ctor.prototype = Object.create(Any.prototype);
  this.Ctor.prototype.constructor = this.Ctor;
  this.Ctor.prototype['__' + this.name + '__'] = true;
}

function extendz(trt) {
  if (!this.isExtended) {
    this.isExtended = true;
    this.Ctor.prototype = Object.create(trt.prototype);
    if (!trt.__Any__) {
      extendProto.call(this, Any);
    }
    this.Ctor.prototype.constructor = this.Ctor;
    this.Ctor.prototype['__' + this.name + '__'] = true;

    this.Ctor.prototype.__super__ = trt;

    this.Ctor.prototype.__supers__ = this.Ctor.prototype.__supers__ || {};
    this.Ctor.prototype.__supers__[getName(trt)] = trt.prototype;
  } else {
    throw Error("Invalid class construction. Can't extend twice.")
  }
  return this;
}

function withz(trt) {
  if (isFunction(trt)) { // Traits are functions
    extendProto.call(this, trt);

    this.Ctor.prototype.__supers__ = this.Ctor.prototype.__supers__ || {};
    this.Ctor.prototype.__supers__[getName(trt)] = trt.prototype;
    
    return this;
  } else {
    return this.body(trt);
  }
}

function body(obj) {
  obj = obj || {};

  var Ctor = this.Ctor;
  if (obj.hasOwnProperty('constructor')) {
    Ctor = obj.constructor;
    Ctor.prototype = Object.create(this.Ctor.prototype);
    Ctor.prototype.constructor = Ctor;
    //delete obj.constructor;
  }

  extendObj.call(this, obj);
  Ctor.prototype.name = this.name;
  Ctor.prototype.__name__ = this.name;
  return Ctor;
}

function TraitBuilder(Ctor) {
  init.call(this, function Trait() {
  }, Ctor);
}

TraitBuilder.prototype = {
  body: function (obj) {
    return body.call(this, obj);
  },

  extendz: function (trt) {
    return extendz.call(this, trt);
  },

  withz: function (trt) {
    return withz.call(this, trt);
  },

  'extends': function (trt) {
    return extendz.call(this, trt);
  },

  'with': function (trt) {
    return withz.call(this, trt);
  }
};

function Trait(Ctor) {
  return new TraitBuilder(Ctor);
}

Trait.required = function () {
  throw new Error("Not implemented");
};

exports.Trait = Trait;
exports.init = init;
exports.extendz = extendz;
exports.withz = withz;
exports.body = body;

/*
var Person, Student,
  __hasProp = {}.hasOwnProperty,
  __extends = function (child, parent) {
    function ctor() {
      this.constructor = child;
    }

    ctor.prototype = parent.prototype;
    child.prototype = new ctor();
    child.__super__ = parent.prototype;
    return child;
  };

Person = (function () {
  function Person() {
  }

  return Person;

})();

Student = (function (_super) {
  __extends(Student, _super);

  function Student() {
    return Student.__super__.constructor.apply(this, arguments);
  }

  return Student;

})(Person);
*/
