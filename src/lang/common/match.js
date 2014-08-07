var equals = require('./equals.js').equals;
var extend = require('./extend.js').extend;
var isFunction = require('./typeCheck.js').isFunction;

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
  caze: function (other, f, context) {
    if (other !== undefined) {
      return this.doCase(other, f, context);
    } else {
      return this.default(f, context).get();
    }
  },
  
  'case': function (other, f, context) {
    return this.caze(other, f, context);
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
  getz: function () {
    throw new Error("MatchError");
  },
  
  'get': function () {
    return this.getz();
  },
  
  defaultz: function (f, context) {
    return new Match(f.call(context, this.o)).get();
  },

  'default': function (f, context) {
    return this.defaultz(f, context);
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
   * @return {Match|*}
   */
  caze: function (other) {
    if (other !== undefined) {
      return this;
    } else {
      return this.getz();
    }
  },
  
  'case': function (other) {
    return this.caze(other);
  },

  /**
   * Returns the result of the callback of the matching case.
   * This call to res is optional if you are not interested in the result.
   * @return {R}
   */
  getz: function () {
    return this.res;
  },
  
  'get': function () {
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
