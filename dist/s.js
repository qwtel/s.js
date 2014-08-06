!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.s=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
var isString = _dereq_('./lang/common/typeCheck.js').isString;

function Any() {
}

Any.prototype = {
  name: 'Any',

  __Any__: true,

  isInstanceOf: function (classLike) {
    if (isString(classLike)) {
      return this['__' + classLike + '__'] === true;
    } else if (classLike.name) {
      return this['__' + classLike.name + '__'] === true;
    } else {
      return this instanceof classLike;
    }
  },

  getClass: function () {
    return this.name
  }
};

exports.Any  = Any;

},{"./lang/common/typeCheck.js":14}],2:[function(_dereq_,module,exports){
var Trait = _dereq_('./lang/Trait.js').Trait;

var Equals = Trait("Equals").body({
  canEqual: Trait.required,
  equals: Trait.required
});

exports.Equals = Equals;

},{"./lang/Trait.js":9}],3:[function(_dereq_,module,exports){
var Class = _dereq_('./lang/Class.js').Class;

var Throwable = Class("Throwable").extends(Error).body({
  constructor: function (message, fileName, lineNumber) {
    Error.call(this, arguments);
    Error.captureStackTrace(this, this.prototype);

    if (message) this.message = message;
    if (fileName) this.fileName = fileName;
    if (lineNumber) this.lineNumber = lineNumber;
  }
});

var Exception = Class("Exception").extends(Throwable).body({});
var RuntimeException = Class("RuntimeException").extends(Exception).body({});
var NoSuchElementException = Class("NoSuchElementException").extends(RuntimeException).body({});
var UnsupportedOperationException = Class("UnsupportedOperationException").extends(RuntimeException).body({});
var IndexOutOfBoundsException = Class("IndexOutOfBoundsException").extends(RuntimeException).body({});
var IllegalArgumentException = Class("IllegalArgumentException").extends(RuntimeException).body({});
// TODO

exports.Throwable = Throwable;
exports.Exception = Exception;
exports.RuntimeException = RuntimeException;
exports.NoSuchElementException = NoSuchElementException;
exports.UnsupportedOperationException = UnsupportedOperationException;
exports.IndexOutOfBoundsException = IndexOutOfBoundsException;
exports.IllegalArgumentException = IllegalArgumentException;

},{"./lang/Class.js":7}],4:[function(_dereq_,module,exports){
var Any = _dereq_('./Any.js').Any;
var Class = _dereq_('./lang/Class.js').Class;
var Equals = _dereq_('./Equals.js').Equals;
var IndexOutOfBoundsException = _dereq_('./Exceptions.js').IndexOutOfBoundsException;
var Trait = _dereq_('./lang/Trait.js').Trait;

var equals = _dereq_('./lang/common/equals.js').equals;

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
  
  canEqual: function (that) {
    return that.isInstanceOf(this.getClass());
  },
  
  equals: function (other) {
    if (other.__Product__) {
      if (this.productArity() === other.productArity()) {
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

var Product1 = Trait("Product1").with(Product).body({
  productArity: function () {
    return 1;
  },

  _1: Trait.required
});

var Product2 = Trait("Product2").with(Product).body({
  productArity: function () {
    return 2;
  },

  _1: Trait.required,
  _2: Trait.required
});

var Product3 = Trait("Product3").with(Product).body({
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

  return Trait("Product" + n).with(Product).body(body);
}

var __ = {};
function getProduct(n) {
  if (!__['Product' + n]) {
    __['Product' + n] = createProduct(n);
  }
  return __['Product' + n];
}

exports.Product = Product;
exports.Product1 = Product1;
exports.Product2 = Product2;
exports.Product3 = Product3;
exports.getProduct = getProduct;

for (var i = 4; i <= 22; i++) {
  exports['Product' + i] = createProduct(i);
}

},{"./Any.js":1,"./Equals.js":2,"./Exceptions.js":3,"./lang/Class.js":7,"./lang/Trait.js":9,"./lang/common/equals.js":11}],5:[function(_dereq_,module,exports){
var Any = _dereq_('../Any.js').Any;

var makeClassBuilder = _dereq_('./Class.js').makeClassBuilder;
var makeWithTraitClassBuilder = _dereq_('./Class.js').makeWithTraitClassBuilder;

var caseClassify = _dereq_('./common/caseClassify.js').caseClassify;
var isFunction = _dereq_('./common/typeCheck.js').isFunction;


function getName(fn) {
  // TODO: Cross-browser?
  return fn.name;
}

function makeCaseClassBuilder(ClassBuilder) {
  
  function CaseClassBuilder(Ctor) {
    if (isFunction(Ctor)) {
      this.Ctor = Ctor;
      this.name = getName(Ctor);
    } else {
      throw Error("wrong")
    }

    this.Ctor.prototype = Object.create(Any.prototype);
    this.Ctor.prototype['__' + this.name + '__'] = true;
  }

  CaseClassBuilder.prototype = Object.create(ClassBuilder.prototype);

  CaseClassBuilder.prototype.body = function (body) {
    var Ctor = ClassBuilder.prototype.body.call(this, body); // super.body(body);
    return caseClassify(Ctor, this.name);
  };
  
  return CaseClassBuilder;
}

function makeWithTraitCaseClassBuilder(WithTraitClassBuilder) {
  
  function WithTraitCaseClassBuilder(instance) {
    this.name = instance.name;
    this.Ctor = instance.Ctor;
  }
  
  WithTraitCaseClassBuilder.prototype = Object.create(WithTraitClassBuilder.prototype);
  
  WithTraitCaseClassBuilder.prototype.body = function (body) {
    var Ctor = WithTraitClassBuilder.prototype.body.call(this, body); // super.body(body);
    return caseClassify(Ctor, this.name);
  };

  return WithTraitCaseClassBuilder;
}

var WithTraitCaseClassBuilder = makeWithTraitCaseClassBuilder(makeWithTraitClassBuilder());
var CaseClassBuilder = makeCaseClassBuilder(makeClassBuilder(WithTraitCaseClassBuilder));

function CaseClass(Ctor) {
  return new CaseClassBuilder(Ctor);
}

exports.makeWithTraitCaseClassBuilder = makeWithTraitCaseClassBuilder;
exports.makeCaseClassBuilder = makeCaseClassBuilder;

//exports.CaseClassBuilder = CaseClassBuilder;
//exports.WithTraitCaseClassBuilder = WithTraitCaseClassBuilder;

exports.CaseClass = CaseClass;

},{"../Any.js":1,"./Class.js":7,"./common/caseClassify.js":10,"./common/typeCheck.js":14}],6:[function(_dereq_,module,exports){
var makeClassBuilder = _dereq_('./Class.js').makeClassBuilder;
var makeWithTraitClassBuilder = _dereq_('./Class.js').makeWithTraitClassBuilder;

var makeCaseClassBuilder = _dereq_('./CaseClass.js').makeCaseClassBuilder;
var makeWithTraitCaseClassBuilder = _dereq_('./CaseClass.js').makeWithTraitCaseClassBuilder;

var makeSingletonBuilder = _dereq_('./Singleton.js').makeSingletonBuilder;
var makeWithTraitSingletonBuilder = _dereq_('./Singleton.js').makeWithTraitSingletonBuilder;

// Where is your god now?
var WithTraitCaseSingletonBuilder = makeWithTraitSingletonBuilder(makeWithTraitCaseClassBuilder(makeWithTraitClassBuilder()));
var CaseSingletonBuilder = makeSingletonBuilder(makeCaseClassBuilder(makeClassBuilder(WithTraitCaseSingletonBuilder)));

function CaseSingleton(Ctor) {
  return new CaseSingletonBuilder(Ctor);
}

exports.CaseSingleton = CaseSingleton;

},{"./CaseClass.js":5,"./Class.js":7,"./Singleton.js":8}],7:[function(_dereq_,module,exports){
var Any = _dereq_('../Any.js').Any;

var extend = _dereq_('./common/extend.js').extend;
var isString = _dereq_('./common/typeCheck.js').isString;
var isFunction = _dereq_('./common/typeCheck.js').isFunction;

function makeClassBuilder(WithTraitClassBuilder) {
  function ClassBuilder(name) {
    if (isFunction(name)) {
      this.Ctor = name;
      name = name.name;
    } else {
      this.Ctor = function () {
        if (this.constructor) {
          this.constructor.apply(this, arguments);
        }
      };
    }

    this.name = name;
    this.Ctor.prototype = Object.create(Any.prototype);
    this.Ctor.prototype['__' + this.name + '__'] = true;
  }

  ClassBuilder.prototype = {
    body: function (body) {
      body = body || {};
      extend(this.Ctor.prototype, body);
      this.Ctor.prototype.name = this.name;
      return this.Ctor;
    },

    extends: function (Parent) {
      this.Ctor.prototype = Object.create(Parent.prototype);

      if (!Parent.__Any__) {
        extend(this.Ctor.prototype, Any.prototype);
      }

      this.Ctor.prototype['__' + this.name + '__'] = true;

      return new WithTraitClassBuilder(this);
    },

    with: function (trt) {
      extend(this.Ctor.prototype, trt);
      return new WithTraitClassBuilder(this);
    }
  };

  return ClassBuilder;
}

function makeWithTraitClassBuilder() {
  function WithTraitClassBuilder(instance) {
    this.name = instance.name;
    this.Ctor = instance.Ctor;
  }

  WithTraitClassBuilder.prototype = {
    body: function (body) {
      body = body || {};
      extend(this.Ctor.prototype, body);
      this.Ctor.prototype.name = this.name;
      return this.Ctor;
    },

    with: function (trt) {
      extend(this.Ctor.prototype, trt);
      return this;
    }
  };
  
  return WithTraitClassBuilder;
}

var WithTraitClassBuilder = makeWithTraitClassBuilder();
var ClassBuilder = makeClassBuilder(WithTraitClassBuilder);

function Class(name, Ctor) {
  return new ClassBuilder(name, Ctor);
}

exports.makeClassBuilder = makeClassBuilder;
exports.makeWithTraitClassBuilder = makeWithTraitClassBuilder;

//exports.ClassBuilder = ClassBuilder;
//exports.WithTraitClassBuilder = WithTraitClassBuilder;

exports.Class = Class;

},{"../Any.js":1,"./common/extend.js":12,"./common/typeCheck.js":14}],8:[function(_dereq_,module,exports){
var makeClassBuilder = _dereq_('./Class.js').makeClassBuilder;
var makeWithTraitClassBuilder = _dereq_('./Class.js').makeWithTraitClassBuilder;

function makeSingletonBuilder(ClassBuilder) {

  function SingletonBuilder(Ctor) {
    ClassBuilder.call(this, Ctor);
  }

  SingletonBuilder.prototype = Object.create(ClassBuilder.prototype);

  SingletonBuilder.prototype.body = function (body) {
    var Ctor = ClassBuilder.prototype.body.call(this, body); // super.body(body);
    if (!Ctor.instance) {
      Ctor.instance = new Ctor();
    }
    return Ctor.instance;
  };

  return SingletonBuilder;
}

function makeWithTraitSingletonBuilder(WithTraitClassBuilder) {

  function WithTraitCaseClassBuilder(instance) {
    WithTraitClassBuilder.call(this, instance);
  }

  WithTraitCaseClassBuilder.prototype = Object.create(WithTraitClassBuilder.prototype);

  WithTraitCaseClassBuilder.prototype.body = function (body) {
    var Ctor = WithTraitClassBuilder.prototype.body.call(this, body); // super.body(body);
    if (!Ctor.instance) {
      Ctor.instance = new Ctor();
    }
    return Ctor.instance;
  };

  return WithTraitCaseClassBuilder;
}

var WithTraitSingletonBuilder = makeWithTraitSingletonBuilder(makeWithTraitClassBuilder());
var SingletonBuilder = makeSingletonBuilder(makeClassBuilder(WithTraitSingletonBuilder));

function Singleton(Ctor) {
  return new SingletonBuilder(Ctor);
}

exports.makeSingletonBuilder = makeSingletonBuilder;
exports.makeWithTraitSingletonBuilder = makeWithTraitSingletonBuilder;

//exports.SingletonBuilder = SingletonBuilder;
//exports.WithTraitSingletonBuilder = WithTraitSingletonBuilder;

exports.Singleton = Singleton;

},{"./Class.js":7}],9:[function(_dereq_,module,exports){
var extend = _dereq_('./common/extend.js').extend;

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

},{"./common/extend.js":12}],10:[function(_dereq_,module,exports){
var IndexOutOfBoundsException = _dereq_('../../Exceptions.js').IndexOutOfBoundsException;
var Product = _dereq_('../../Product.js').Product;

var extend = _dereq_('./extend.js').extend;
var match = _dereq_('./match.js').match;

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

function getName(fn) {
  // TODO: Cross-browser?
  return fn.name;
}

function caseClassify(Ctor) {

  var name = getName(Ctor);
  var argumentNames = getArgumentNames(Ctor);

  var Factory = function () {
    return Factory.app.apply(undefined, arguments);
  };

  // TODO: What is the name property anyway?
  Factory.name = name;

  Factory.__product__ = name;

  Factory.fromJSON = function (jsonObj) {
    var cc = new Ctor();
    Object.keys(jsonObj).forEach(function (name) {
      cc[name] = jsonObj[name];
    });
    return cc;
  };

  Factory.app = function () {
    var cc = new Ctor();
    for (var i = 0; i < arguments.length; i++) {
      cc[argumentNames[i]] = arguments[i];
    }
    return cc;
  };

  Factory.unApp = function (cc) {
    return argumentNames.map(function (name) {
      return cc[name];
    });
  };

  extend(Ctor.prototype, Product);
  extend(Ctor.prototype, {

    // TODO: Better name?
    __factory__: Factory,

    name: name,

    copy: function (patchObj) {
      var copy = new Ctor({});
      argumentNames.forEach(function (name) {
        if (patchObj[name]) copy[name] = patchObj[name];
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

    hashCode: function () {
      console.warn("hashCode implementation missing");
      return -1;
    },

    /*
     toString: function () {
     return this.productIterator().mkString(this.productPrefix + "(", ",", ")");
     },
     */

    // this isn't really required. JSON.stringify works anyway...
    toJSON: function () {
      var res = {};
      argumentNames.map(function (name) {
        res[name] = this[name];
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

exports.caseClassify = caseClassify;

},{"../../Exceptions.js":3,"../../Product.js":4,"./extend.js":12,"./match.js":13}],11:[function(_dereq_,module,exports){
function equals(o1, o2) {
  if (o1.equals) {
    if (o2.equals) {
      return o1.equals(o2);
    } else {
      return false;
    }
  } else {
    if (o2.equals) {
      return o1 === o2;
    } else {
      return false;
    }
  }
}

exports.equals = equals;

},{}],12:[function(_dereq_,module,exports){
function extend(obj, by) {
  by = by || {};
  Object.keys(by).forEach(function (key) {
    obj[key] = by[key];
  });
  return obj;
}

exports.extend = extend;

},{}],13:[function(_dereq_,module,exports){
var equals = _dereq_('./equals.js').equals;
var extend = _dereq_('./extend.js').extend;
var isFunction = _dereq_('./typeCheck.js').isFunction;

/**
 * @template B
 * @template R
 * @param o {B} Any JS value to match against.
 * @constructor
 */
function Case(o) {
  this.o = o;
}

Case.prototype = {

  /**
   *
   * @param {B} other - An arbitrary object to compare to
   * @param {function(B): R} f - A callback function if it is a match.
   * @param {object=} context
   * @return {Match|Case}
   */
  case: function (other, f, context) {
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

  /**
   * Can't get a result before a matching pattern has been found.
   * @throws {Error}
   */
  get: function () {
    throw new Error("MatchError");
  },

  default: function (f, context) {
    return new Match(f.call(context, this.o));
  }
};

/**
 * Matching against a scalaish object.
 * This means a `isInstanceOf` method is present.
 *
 * @param {Any} o - A scalaish object
 * @constructor
 * @extends {Case}
 */
function CaseClassCase(o) {
  Case.call(this, o);
}

var unApp = function (Class, o) {
// TODO: recursive unApp
  return Class.unApp ?
    Class.unApp(o) :
    [o];
};

CaseClassCase.prototype = extend(Object.create(Case.prototype), {

  /**
   * @param {Factory} Class - The factory method (pseudo companion object) of a scalaish class
   * @param {function(B): R} f
   * @param {object=} context
   * @return {Match|CaseClassCase}
   */
  doCase: function (Class, f, context) {
    return (this.o.__factory__.__product__ === Class.__product__) ?
      new Match(f.apply(context, unApp(Class, this.o))) :
      this;
  }
});

/**
 * Matching against a JS object.
 * This means a the `instaceof` operator is used.
 *
 * @param {object} o
 * @constructor
 * @extends {Case}
 */
function ConstructorCase(o) {
  Case.call(this, o);
}

ConstructorCase.prototype = extend(Object.create(Case.prototype), {

  /**
   * Returns a `Match` if `this.o` has been created with the constructor `Class`.
   *
   * @param {function} Class - A regular JS constructor function
   * @param {function(B): R} f
   * @param {object=} context
   * @return {Match|ConstructorCase}
   */
  doCase: function (Class, f, context) {
    return (this.o instanceof Class) ?
      new Match(f.call(context, this.o)) :
      this;
  }
});

/**
 * Represents a match.
 * All further calls to 'case' will be ignored.
 *
 * @param {R} res The result of the case callback function
 * @constructor
 */
function Match(res) {
  this.res = res;
}

Match.prototype = {
  /**
   * @return {Match}
   */
  case: function () {
    return this;
  },

  /**
   * Returns the result of the callback of the matching case.
   * This call to res is optional if you are not interested in the result.
   * @return {R}
   */
  get: function () {
    return this.res;
  }
};

/**
 * Starts a pseudo pattern-match.
 *
 * @param {*} o
 * @return {Case}
 */
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

},{"./equals.js":11,"./extend.js":12,"./typeCheck.js":14}],14:[function(_dereq_,module,exports){
['Function', 'String', 'Number']
  .forEach(function (name) {
    exports['is' + name] = function (obj) {
      return typeof obj === name.toLowerCase();
    }
  });

},{}],15:[function(_dereq_,module,exports){
var Class = _dereq_('./lang/Class.js').Class;
var Singleton = _dereq_('./lang/Singleton.js').Singleton;
var CaseClass = _dereq_('./lang/Class.js').CaseClass;
var CaseSingleton = _dereq_('./lang/CaseSingleton.js').CaseSingleton;
var Trait = _dereq_('./lang/Trait.js').Trait;

var any = _dereq_('./Any.js');
var equals = _dereq_('./Equals.js');
var exceptions = _dereq_('./Exceptions.js');

var s = {
  Class: Class,
  Singleton: Singleton,
  CaseClass: CaseClass,
  CaseSingleton: CaseSingleton,
  Trait: Trait,
  
  Any: any.Any,
  Equals: equals.Equals
};

module.exports = s;

},{"./Any.js":1,"./Equals.js":2,"./Exceptions.js":3,"./lang/CaseSingleton.js":6,"./lang/Class.js":7,"./lang/Singleton.js":8,"./lang/Trait.js":9}]},{},[15])
(15)
});