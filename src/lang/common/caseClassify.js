var IndexOutOfBoundsException = require('../../Exceptions.js').IndexOutOfBoundsException;
var Product = require('../../Product.js').Product;

var extend = require('./extend.js').extend;
var match = require('./match.js').match;

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
