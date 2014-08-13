!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.s=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
var isInstanceOf = _dereq_('./lang/common/isInstanceOf.js').isInstanceOf;

function Any() {
}

Any.prototype = {
  name: 'Any',

  __Any__: true,

  isInstanceOf: function (classLike) {
    return isInstanceOf(this, classLike);
  },

  getClass: function () {
    return this.__name__;
  }
};

exports.Any  = Any;

},{"./lang/common/isInstanceOf.js":17}],2:[function(_dereq_,module,exports){
var Trait = _dereq_('./lang/Trait.js').Trait;

var Equals = Trait("Equals").body({
  canEqual: Trait.required,
  equals: Trait.required
});

exports.Equals = Equals;

},{"./lang/Trait.js":12}],3:[function(_dereq_,module,exports){
var s = _dereq_('./global.js').s;

var lang = _dereq_('./lang.js');
var Class = lang.Class;
var CaseClass = lang.CaseClass;
var CaseSingleton = lang.CaseSingleton;
var Trait = lang.Trait;

var common = _dereq_('./lang/common.js');
var result = common.result;
var equals = common.equals;

var NoSuchElementException = _dereq_('./lang/exception.js').NoSuchElementException;

var Option = Trait(function Option(x) {
  if (x === null || x === undefined) {
    return None;
  }
  else {
    return Some(x);
  }
}).body({

  isEmpty: Trait.required,

  isDefined: function () {
    return !this.isEmpty();
  },

  // TODO: Rename to avoid JS Object conflict?
  get: function () {
    throw new Error("TODO: NotImplementedError");
  },

  getOrElse: function (def, context) {
    if (this.isEmpty()) {
      return result(def, context);
    } else {
      return this.get();
    }
  },

  orNull: function () {
    return this.getOrElse(null);
  },

  map: function (f, context) {
    if (this.isEmpty()) {
      return None;
    } else {
      return Some(f.call(context, this.get()));
    }
  },
  
  // TODO: fold or reduce?
  fold: function (ifEmpty, contextIfEmpty) {
    // TODO: Better way to document this / better way for partial application?
    return function (f, context) {
      if (this.isEmpty()) {
        return result(ifEmpty, contextIfEmpty);
      } else {
        return f.call(context, this.get());
      }
    }.bind(this);
  },

  // TODO: fold or reduce?
  reduce: function (f, ifEmpty, context) {
    if (this.isEmpty()) {
      return result(ifEmpty, context);
    } else {
      return f.call(context, this.get());
    }
  },
  
  flatMap: function (f, context) {
    if (this.isEmpty()) {
      return None;
    } else {
      return f.call(context, this.get());
    }
  },

  flatten: function () {
    if (this.isEmpty()) {
      return None;
    } else {
      return this.get();
    }
  },

  filter: function (p, context) {
    if (this.isEmpty() || p.call(context, this.get())) {
      return this;
    } else {
      return None;
    }
  },

  filterNot: function (p, context) {
    if (this.isEmpty() || !p.call(context, this.get())) {
      return this;
    } else {
      return None;
    }
  },

  nonEmpty: function () {
    return this.isDefined();
  },

  // TODO: This is the exact same code as in Try
  withFilter: function (p, context) {
    var self = this;

    var WithFilter = Class(function WithFilter(p, context) {
      this.p = p;
      this.context = context;
    }).body({
      map: function (f, context) {
        return self.filter(this.p, this.context).map(f, context);
      },
      flatMap: function (f, context) {
        return self.filter(this.p, this.context).flatMap(f, context);
      },
      forEach: function (f, context) {
        return self.filter(this.p, this.context).forEach(f, context);
      },
      withFilter: function (q, context) {
        return new WithFilter(function (x) {
          return this.p.call(this.context, x) && q.call(context, x);
        }.bind(this), context);
      }
    });

    return new WithFilter(p, context);
  },

  contains: function (elem) {
    return !this.isEmpty() && equals(this.get(), elem);
  },

  exists: function (p, context) {
    return !this.isEmpty() && p.call(context, this.get());
  },

  forAll: function (p, context) {
    return this.isEmpty() || p.call(context, this.get());
  },

  forEach: function (f, context) {
    if (!this.isEmpty()) {
      return f.call(context, this.get());
    }
  },

  // TODO: collect

  orElse: function (alternative, context) {
    if (this.isEmpty()) {
      return result(alternative, context);
    } else {
      return this;
    }
  },

  // TODO: iterator

  // TODO: toList

  toRight: function (left, context) {
    if (s.Either) {
      return this.isEmpty() ? s.Left(result(left, context)) : s.Right(this.get());
    } else {
      throw Error("Module 'Either' not loaded.");
    }
  },

  toLeft: function (right, context) {
    if (s.Either) {
      return this.isEmpty() ? s.Right(result(right, context)) : s.Left(this.get());
    } else {
      throw Error("Module 'Either' not loaded.");
    }
  }
});

Option.empty = function () {
  return None;
};

var Some = CaseClass(function Some(x) {
  this.x = x;
}).extends(Option).body({

  get: function () {
    return this.x;
  },

  isEmpty: function () {
    return false;
  }
});

var None = CaseSingleton(function None() {
}).extends(Option).body({

  get: function () {
    throw new NoSuchElementException("None.get");
  },

  isEmpty: function () {
    return true;
  }
});

exports.Option = Option;
exports.Some = Some;
exports.None = None;


},{"./global.js":6,"./lang.js":7,"./lang/common.js":13,"./lang/exception.js":22}],4:[function(_dereq_,module,exports){
var s = _dereq_('./global.js').s;

var Any = _dereq_('./Any.js').Any;
var Equals = _dereq_('./Equals.js').Equals;

var Class = _dereq_('./lang/Class.js').Class;
var Trait = _dereq_('./lang/Trait.js').Trait;

var exception = _dereq_('./lang/exception.js');
var IndexOutOfBoundsException = exception.IndexOutOfBoundsException;

var equals = _dereq_('./lang/common/equals.js').equals;
var isInstanceOf = _dereq_('./lang/common/isInstanceOf.js').isInstanceOf;

var Product = Trait("Product").with(Equals).body({
  productElement: function (n) {
    if (n < this.productArity()) {
      return this['_' + (n + 1)];
    } else {
      throw new IndexOutOfBoundsException(n);
    }
  },

  productArity: Trait.required,

  productIterator: function () {
    var self = this;
    var c = 0;
    var cmax = self.productArity();
    return new (Class(AbstractIterator).body({
      hasNext: function () {
        return c < cmax;
      },
      next: function () {
        var result = self.productElement(c);
        c++;
        return result;
      }
    }));
  },

  // Hacky implementation, good enough for now
  toString: function () {
    var values = [];
    for (var i = 0; i < this.productArity(); i++) {
      values.push(this.productElement(i).toString());
    }
    return this.productPrefix + '(' + values.join(',') + ')';
  },

  canEqual: function (That) {
    return isInstanceOf(this, That);
  },

  equals: function (other) {
    if (this.__name__ === other.__name__) {
      if (other.productArity && this.productArity() === other.productArity()) {
        var res = true;
        for (var i = 0; i < this.productArity(); i++) {
          res = res && equals(this.productElement(i), other.productElement(i))
        }
        return res
      }
    }
    return false;
  },

  // ???
  productPrefix: ''

});

var Product1 = Trait("Product1").extends(Product).body({
  productArity: function () {
    return 1;
  },

  _1: Trait.required
});

var Product2 = Trait("Product2").extends(Product).body({
  productArity: function () {
    return 2;
  },

  _1: Trait.required,
  _2: Trait.required
});

var Product3 = Trait("Product3").extends(Product).body({
  productArity: function () {
    return 3;
  },

  _1: Trait.required,
  _2: Trait.required,
  _3: Trait.required
});

function createProduct(n) {
  var body = {
    productArity: function () {
      return n;
    }
  };

  for (var i = 1; i <= n; i++) {
    body['_' + i] = Trait.required;
  }

  return Trait("Product" + n).extends(Product).body(body);
}

function getProduct(n) {
  if (!s['Product' + n]) {
    s['Product' + n] = createProduct(n);
  }
  return s['Product' + n];
}

exports.Product = Product;
exports.Product1 = Product1;
exports.Product2 = Product2;
exports.Product3 = Product3;
exports.getProduct = getProduct;

for (var i = 4; i <= 22; i++) {
  exports['Product' + i] = getProduct(i);
}

},{"./Any.js":1,"./Equals.js":2,"./global.js":6,"./lang/Class.js":10,"./lang/Trait.js":12,"./lang/common/equals.js":15,"./lang/common/isInstanceOf.js":17,"./lang/exception.js":22}],5:[function(_dereq_,module,exports){
var s = _dereq_('./global.js').s;

var Any = _dereq_('./Any.js').Any;

var Class = _dereq_('./lang/Class.js').Class;
var CaseClass = _dereq_('./lang/CaseClass.js').CaseClass;

var product = _dereq_('./Product.js');
var Product = product.Product;
var Product1 = product.Product1;
var Product2 = product.Product2;
var Product3 = product.Product3;
var getProduct = product.getProduct;

var Tuple1 = CaseClass(function Tuple1(_1) {
}).extends(Product1).body();

var Tuple2 = CaseClass(function Tuple2(_1, _2) {
}).extends(Product2).body();

var Tuple3 = CaseClass(function Tuple3(_1, _2, _3) {
}).extends(Product3).body();

function createTuple(n) {
  var defaults = {};
  for (var i = 1; i <= n; i++) {
    defaults['_' + i] = undefined;
  }
  return CaseClass("Tuple" + n, defaults).extends(getProduct(n)).body();
}

function getTuple(n) {
  if (!s['Tuple' + n]) {
    s['Tuple' + n] = createTuple(n);
  }
  return s['Tuple' + n];
}

function t() {
  return getTuple(arguments.length).apply(undefined, arguments);
}

exports.Tuple1 = Tuple1;
exports.Tuple2 = Tuple2;
exports.Tuple3 = Tuple3;
exports.getTuple = getTuple;
exports.t = t;

for (var i = 4; i <= 22; i++) {
  exports['Tuple' + i] = getTuple(i);
}

},{"./Any.js":1,"./Product.js":4,"./global.js":6,"./lang/CaseClass.js":8,"./lang/Class.js":10}],6:[function(_dereq_,module,exports){
var s = {};
exports.s = s;

},{}],7:[function(_dereq_,module,exports){
var Class = _dereq_('./lang/Class.js').Class;
var Singleton = _dereq_('./lang/Singleton.js').Singleton;
var CaseClass = _dereq_('./lang/CaseClass.js').CaseClass;
var CaseSingleton = _dereq_('./lang/CaseSingleton.js').CaseSingleton;
var Trait = _dereq_('./lang/Trait.js').Trait;

var lang = {
  Class: Class,
  Singleton: Singleton,
  CaseClass: CaseClass,
  CaseSingleton: CaseSingleton,
  Trait: Trait
};

module.exports = lang;

},{"./lang/CaseClass.js":8,"./lang/CaseSingleton.js":9,"./lang/Class.js":10,"./lang/Singleton.js":11,"./lang/Trait.js":12}],8:[function(_dereq_,module,exports){
var caseClassify = _dereq_('./common/caseClassify.js').caseClassify;

var isFunction = _dereq_('./common/typeCheck.js').isFunction;
var isString = _dereq_('./common/typeCheck.js').isString;
var isArray = _dereq_('./common/typeCheck.js').isArray;
var isObject = _dereq_('./common/typeCheck.js').isObject;

var init = _dereq_('./Trait').init;
var extendz = _dereq_('./Trait').extendz;
var withz = _dereq_('./Trait').withz;
var body = _dereq_('./Trait').body;

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

},{"./Trait":12,"./common/caseClassify.js":14,"./common/typeCheck.js":20}],9:[function(_dereq_,module,exports){
var caseClassify = _dereq_('./common/caseClassify.js').caseClassify;

var init = _dereq_('./Trait').init;
var extendz = _dereq_('./Trait').extendz;
var withz = _dereq_('./Trait').withz;
var body = _dereq_('./Trait').body;

var isFunction = _dereq_('./common/typeCheck.js').isFunction;

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


},{"./Trait":12,"./common/caseClassify.js":14,"./common/typeCheck.js":20}],10:[function(_dereq_,module,exports){
var Any = _dereq_('../Any.js').Any;

var isString = _dereq_('./common/typeCheck.js').isString;
var isFunction = _dereq_('./common/typeCheck.js').isFunction;

var init = _dereq_('./Trait').init;
var extendz = _dereq_('./Trait').extendz;
var withz = _dereq_('./Trait').withz;
var body = _dereq_('./Trait').body;

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

},{"../Any.js":1,"./Trait":12,"./common/typeCheck.js":20}],11:[function(_dereq_,module,exports){
var init = _dereq_('./Trait').init;
var extendz = _dereq_('./Trait').extendz;
var withz = _dereq_('./Trait').withz;
var body = _dereq_('./Trait').body;

var isFunction = _dereq_('./common/typeCheck.js').isFunction;

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

},{"./Trait":12,"./common/typeCheck.js":20}],12:[function(_dereq_,module,exports){
var Any = _dereq_('../Any.js').Any;

var isFunction = _dereq_('./common/typeCheck.js').isFunction;
var isString = _dereq_('./common/typeCheck.js').isString;

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
    this.Ctor = DefaultCtor;
    this.name = 'Anonymous' + (DefaultCtor.getClass ? DefaultCtor.getClass() : '');
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

},{"../Any.js":1,"./common/typeCheck.js":20}],13:[function(_dereq_,module,exports){
var caseClassify = _dereq_('./common/caseClassify.js').caseClassify;
var equals = _dereq_('./common/equals.js').equals;
var extend = _dereq_('./common/extend.js').extend;
var isInstanceOf = _dereq_('./common/isInstanceOf.js').isInstanceOf;
var match = _dereq_('./common/match.js').match;
var result = _dereq_('./common/result.js').result;
var isFunction = _dereq_('./common/typeCheck.js').isFunction;
var isObject = _dereq_('./common/typeCheck.js').isObject;
var wrap = _dereq_('./common/wrap.js').wrap;

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

},{"./common/caseClassify.js":14,"./common/equals.js":15,"./common/extend.js":16,"./common/isInstanceOf.js":17,"./common/match.js":18,"./common/result.js":19,"./common/typeCheck.js":20,"./common/wrap.js":21}],14:[function(_dereq_,module,exports){
var IndexOutOfBoundsException = _dereq_('../exception.js').IndexOutOfBoundsException;
var Product = _dereq_('../../Product.js').Product;

var extend = _dereq_('./extend.js').extend;
var match = _dereq_('./match.js').match;

var isObject = _dereq_('./typeCheck.js').isObject;

/**
 * (c) Angular.js
 */
var FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
var FN_ARG_SPLIT = /,/;
var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;

/**
 * (c) Angular.js
 */
function getArgumentNames(fn) {
  var fnText, argDecl, res = [];

  if (typeof fn === 'function') {
    fnText = fn.toString().replace(STRIP_COMMENTS, '');
    argDecl = fnText.match(FN_ARGS);
    Array.prototype.forEach.call(argDecl[1].split(FN_ARG_SPLIT), function (arg) {
      res.push(arg.trim());
    });
  }

  return res;
}

function caseClassify(Ctor, name, defaults) {
  
  var argumentNames = isObject(defaults) ? Object.keys(defaults) : getArgumentNames(Ctor);
  
  defaults = defaults || {}; // prevent exceptions
  
  var types = {};
  Object.keys(defaults).forEach(function (name) {
    //types[name] = getClass(defaults[name])
  });
  
  function setProp(cc, k, v) {
    //if (isInstanceOf(v, types[k])) {
      cc[k] = v;
    //} else {
      //throw Error("Can't have property '" + k + "' of type '" + getClass(v) + "' because it's default type is '" + types[v] + "'");
    //}
  }
  
  var Factory = function () {
    return Factory.app.apply(undefined, arguments);
  };
  
  Factory.prototype = Ctor.prototype;

  // TODO: What is the name property anyway?
  Factory.name = name;
  Factory.__name__ = name;

  Factory.fromJSON = function (jsonObj) {
    var cc = new Ctor();
    Object.keys(jsonObj).forEach(function (name) {
      setProp(cc, name, (jsonObj[name] || defaults[argumentNames[i]]));
    });
    return cc;
  };

  Factory.app = function () {
    var cc = new Ctor();
    for (var i = 0; i < argumentNames.length; i++) {
      setProp(cc, argumentNames[i], (arguments[i] || defaults[argumentNames[i]]));
    }
    return cc;
  };

  Factory.unApp = function (cc) {
    return argumentNames.map(function (name) {
      return cc[name];
    });
  };

  extend(Ctor.prototype, Product.prototype);
  extend(Ctor.prototype, {

    // TODO: Better name?
    __factory__: Factory,

    // has been overridden by Product.prototype
    __name__: name,
    name: name,

    copy: function (patchObj) {
      var copy = new Ctor();
      argumentNames.forEach(function (name) {
        if (typeof patchObj[name] !== 'undefined') {
          setProp(copy, name, patchObj[name]);
        }
        else copy[name] = this[name];
      }, this);
      return copy;
    },

    productArity: function () {
      return argumentNames.length;
    },

    productElement: function (n) {
      if (n < argumentNames.length) {
        return this[argumentNames[n]];
      } else {
        throw new IndexOutOfBoundsException();
      }
    },

    productPrefix: name,

    /*
     equals: function (other) {
     if (other.isInstanceOf(Product)) {
     if (this.productArity() === other.productArity()) {
     return this.productIterator().sameElements(other.productIterator());
     }
     }

     return false;
     },
     */

    /*
    hashCode: function () {
      console.warn("hashCode implementation missing");
      return -1;
    },
    */

    /*
     toString: function () {
     return this.productIterator().mkString(this.productPrefix + "(", ",", ")");
     },
     */

    // this isn't really required. JSON.stringify works anyway...
    toJSON: function () {
      var res = {};
      argumentNames.map(function (name) {
        res[name] = toJSON(this[name]);
      }, this);
      return res;
    },

    /**
     * Start a pseudo pattern match
     * @return {*}
     */
    match: function () {
      return match(this);
    }
  });

  return Factory;
}

function toJSON(obj) {
  return obj.toJSON ? obj.toJSON() : obj;
}

exports.caseClassify = caseClassify;

},{"../../Product.js":4,"../exception.js":22,"./extend.js":16,"./match.js":18,"./typeCheck.js":20}],15:[function(_dereq_,module,exports){
function equals(o1, o2) {
  if (o1.equals) {
    if (o2.equals) {
      return o1.equals(o2);
    } else {
      return false;
    }
  } else {
    if (o2.equals) {
      return false;
    } else {
      return o1 === o2;
    }
  }
}

exports.equals = equals;

},{}],16:[function(_dereq_,module,exports){
function extend(obj, by) {
  by = by || {};
  Object.keys(by).forEach(function (key) {
    obj[key] = by[key];
  });
  return obj;
}

function extendComplete(obj, by) {
  by = by || {};
  for (var key in by) {
    obj[key] = by[key];
  }
  return obj;
}

exports.extend = extend;
exports.extendComplete = extendComplete;

},{}],17:[function(_dereq_,module,exports){
var isString = _dereq_('./typeCheck.js').isString;

function isInstanceOf(that, classLike) {
  if (isString(classLike)) {
    return that['__' + classLike + '__'] === true;
  } else if (classLike.__name__) {
    return that['__' + classLike.__name__ + '__'] === true;
  } else if (classLike.prototype.__name__) {
    return that['__' + classLike.prototype.__name__ + '__'] === true;
  } else {
    return that instanceof classLike;
  }
}

exports.isInstanceOf = isInstanceOf;

},{"./typeCheck.js":20}],18:[function(_dereq_,module,exports){
var equals = _dereq_('./equals.js').equals;
var extend = _dereq_('./extend.js').extend;
var isFunction = _dereq_('./typeCheck.js').isFunction;

var Class = _dereq_('../Class.js').Class;

var Case = Class(function Case(o) {
  this.o = o;
}).with({
  caze: function (other, f, context) {
    if (other !== undefined) {
      return this.doCase(other, f, context);
    } else {
      return this.default(f, context);
    }
  },

  doCase: function (other, f, context) {
    return (equals(this.o, other)) ?
      new Match(f.call(context, this.o)) :
      this;
  },

  getz: function () {
    throw new Error("MatchError");
  },

  defaultz: function (f, context) {
    return new Match(f.call(context, this.o));
  },

  // Alias

  'case': function (other, f, context) {
    return this.caze(other, f, context);
  },

  'get': function () {
    return this.getz();
  },

  'default': function (f, context) {
    return this.defaultz(f, context);
  }
});

var CaseClassCase = Class(function CaseClassCase(o) {
  this.o = o;
}).extends(Case).with({
  doCase: function (Class, f, context) {
    return (this.o.__factory__.__name__ === Class.__name__ || /* CaseSingleton */ this.o === Class) ?
      new Match(f.apply(context, unApp(Class, this.o))) :
      this;
  }
});

// TODO: recursive unApp
function unApp(Class, o) {
  return Class.unApp ?
    Class.unApp(o) :
    [o];
}

var ConstructorCase = Class(function ConstructorCase(o) {
  this.o = o;
}).extends(Case).with({
  doCase: function (Class, f, context) {
    return (this.o instanceof Class) ?
      new Match(f.call(context, this.o)) :
      this;
  }
});

var Match = Class(function (res) {
  this.res = res;
}).extends(Case).with({
  doCase: function () {
    return this;
  },

  getz: function () {
    return this.res;
  },

  defaultz: function () {
    return this.res;
  }
});

function match(o) {
  if (o.__factory__ && o.__factory__.unApp) {
    return new CaseClassCase(o);
//} else if (o.__Any__) {
  // return new ClassCase(o);
  } else if (isFunction(o)) {
    return new ConstructorCase(o);
  } else {
    return new Case(o);
  }
}

exports.match = match;

},{"../Class.js":10,"./equals.js":15,"./extend.js":16,"./typeCheck.js":20}],19:[function(_dereq_,module,exports){
var isFunction = _dereq_('./typeCheck.js').isFunction;

function result(value, context) {
  return isFunction(value) ? value.call(context) : value;
}

exports.result = result;

},{"./typeCheck.js":20}],20:[function(_dereq_,module,exports){
['Function', 'Object']
  .forEach(function (name) {
    exports['is' + name] = function (obj) {
      return typeof obj === name.toLowerCase();
    }
  });

exports.isString = function (s) {
  return typeof s === 'string';
};

exports.isArray = function (arr) {
  return Array.isArray(arr);
};

},{}],21:[function(_dereq_,module,exports){
var extend = _dereq_('./extend.js').extend;
var isFunction = _dereq_('./typeCheck.js').isFunction;

function wrap(target, Class) {
  function Obj () {
    return target.app.apply(target, arguments);
  }
  
  if (Class) {
    Obj.prototype = Class.prototype;
  }
  
  Object.keys(target).forEach(function (key) {
    var value = target[key];
    if (isFunction(value)) {
      Obj[key] = value.bind(target);
    } else {
      Obj[key] = value;
    }
  });

  return Obj;
}

exports.wrap = wrap;

},{"./extend.js":16,"./typeCheck.js":20}],22:[function(_dereq_,module,exports){
var Class = _dereq_('./Class.js').Class;
var Trait = _dereq_('./Trait.js').Trait;

var NoStackTrace = Trait('NoStackTrace').body();

var Throwable = Class("Throwable").extends(Error).body({
  constructor: function (message, fileName, lineNumber) {
    Error.call(this, arguments);
    
    if (!this.isInstanceOf(NoStackTrace)) {
      Error.captureStackTrace(this, this.prototype);
    }

    if (message) this.message = message;
    if (fileName) this.fileName = fileName;
    if (lineNumber) this.lineNumber = lineNumber;
  }
});

var ControlThrowable = Class("ControlThrowable").extends(Throwable).with(NoStackTrace).body();

var Exception = Class("Exception").extends(Throwable).body({});
var RuntimeException = Class("RuntimeException").extends(Exception).body({});
var NoSuchElementException = Class("NoSuchElementException").extends(RuntimeException).body({});
var UnsupportedOperationException = Class("UnsupportedOperationException").extends(RuntimeException).body({});
var IndexOutOfBoundsException = Class("IndexOutOfBoundsException").extends(RuntimeException).body({});
var IllegalArgumentException = Class("IllegalArgumentException").extends(RuntimeException).body({});
// TODO

exports.Throwable = Throwable;
exports.ControlThrowable = ControlThrowable;
exports.Exception = Exception;
exports.RuntimeException = RuntimeException;
exports.NoSuchElementException = NoSuchElementException;
exports.UnsupportedOperationException = UnsupportedOperationException;
exports.IndexOutOfBoundsException = IndexOutOfBoundsException;
exports.IllegalArgumentException = IllegalArgumentException;

},{"./Class.js":10,"./Trait.js":12}],23:[function(_dereq_,module,exports){
var s = _dereq_('./global.js').s;

var extend = _dereq_('./lang/common/extend.js').extend;

var lang = _dereq_('./lang.js');

var exception = _dereq_('./lang/exception.js');

var product = _dereq_('./Product.js');
var tuple = _dereq_('./Tuple.js');

var option = _dereq_('./Option.js');

var any = _dereq_('./Any.js');
var equals = _dereq_('./Equals.js');

var common = _dereq_('./lang/common.js');

s.common = common;
s = extend(s, lang);
s = extend(s, exception);
s = extend(s, product);
s = extend(s, tuple);
s = extend(s, option);
s = extend(s, {
  _: undefined,
  Any: any.Any,
  Equals: equals.Equals
});

module.exports = s;

},{"./Any.js":1,"./Equals.js":2,"./Option.js":3,"./Product.js":4,"./Tuple.js":5,"./global.js":6,"./lang.js":7,"./lang/common.js":13,"./lang/common/extend.js":16,"./lang/exception.js":22}]},{},[23])
(23)
});