var equals = require('./equals.js').equals;
var extend = require('./extend.js').extend;
var isFunction = require('./typeCheck.js').isFunction;

var Class = require('../Class.js').Class;

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
