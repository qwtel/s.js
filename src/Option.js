var lang = require('./lang.js');
var Class = lang.Class;
var CaseClass = lang.CaseClass;
var CaseSingleton = lang.CaseSingleton;
var Trait = lang.Trait;

var common = require('./lang/common.js');
var result = common.result;
var equals = common.equals;

var NoSuchElementException = require('./lang/exception.js').NoSuchElementException;

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
    //return this.isEmpty() ? Left(result(left, context)) : Right(this.get());
  },

  toLeft: function (right, context) {
    //return this.isEmpty() ? Right(result(right, context)) : Left(this.get());
  }

});

Option.empty = function () {
  return None;
};

var Some = CaseClass(function Some(x) {
  this.x = x;
}).with(Option).body({

  get: function () {
    return this.x;
  },

  isEmpty: function () {
    return false;
  }
});

var None = CaseSingleton(function None() {
}).with(Option).body({

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

