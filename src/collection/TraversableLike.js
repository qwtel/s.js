var s = require('../global.js').s;

var Class = require('../lang/Class').Class;
var Trait = require('../lang/Trait').Trait;

var Option = require('../Option').Option;
var Some = require('../Option').Some;
var None = require('../Option').None;

var TraversableOnce = require('./TraversableOnce').TraversableOnce;

var ControlThrowable = require('../lang/exception').ControlThrowable;
var NoSuchElementException = require('../lang/exception').NoSuchElementException;
var UnsupportedOperationException = require('../lang/exception').UnsupportedOperationException;

var t = require('../Tuple').t;

var BreakControl = Class("BreakControl").extends(ControlThrowable).body();

var TraversableLike = Trait(function TraversableLike() {
}).with(TraversableOnce).body({

  newBuilder: Trait.required,

  forEach: Trait.required,

  buildFrom: Trait.required,
  
  repr: function () {
    return this.getClass();
  },

  isTraversableAgain: function () {
    return true;
  },

  isEmpty: function () {
    var result = true;

    try {
      this.forEach(function () {
        result = false;
        throw new BreakControl();
      });
    } catch (e) {
      if (!(e instanceof BreakControl)) {
        throw e;
      }
    }

    return result;
  },

  hasDefinedSize: function () {
    return true;
  },

  addedAll: function (that) {
    var b = this.buildFrom(this.repr());

    if (that.isInstanceOf('IndexedSeqLike')) b.sizeHint(this, that.seq().size());
    b.addAll(this);
    b.addAll(that.seq());

    return b.result();
  },

  map: function (f, context) {
    var b = this.buildFrom(this.repr());
    b.sizeHint(this);

    this.forEach(function (x) {
      b.add(f.call(context, x))
    });

    return b.result();
  },

  flatMap: function (f, context) {
    var b = this.buildFrom(this.repr());

    this.forEach(function (x) {
      b.addAll(f.call(context, x).seq())
    });

    return b.result();
  },

  filter: function (p, context) {
    return filterImpl.call(this, p, false, context)
  },

  filterNot: function (p, context) {
    return filterImpl.call(this, p, true, context)
  },

  // TODO: collect

  partition: function (p, context) {
    var l = this.newBuilder();
    var r = this.newBuilder();

    this.forEach(function (x) {
      (p.call(context, x) ? l : r).add(x);
    });

    return t(l.result(), r.result());
  },

  groupBy: function (f, context) {
    var m = s.mutable.Map.empty();
    this.forEach(function (elem) {
      var key = f.call(context, elem);
      var bldr = m.getOrElseUpdate(key, this.newBuilder());
      bldr.add(elem);
    }, this);
    var b = s.immutable.Map.newBuilder();
    m.forEach(function (pair) {
      var k = pair._1;
      var v = pair._2;
      b.add(t(k, v.result()));
    });
    return b.result();
  },

  forAll: function (p, context) {
    var result = true;

    try {
      this.forEach(function (x) {
        if (!p.call(context, x)) {
          result = false;
          throw new BreakControl();
        }
      });
    } catch (e) {
      if (!(e instanceof BreakControl)) {
        throw e;
      }
    }

    return result;
  },

  every: function (p, context) {
    return this.forAll(p, context);
  },

  exists: function (p, context) {
    var result = false;

    try {
      this.forEach(function (x) {
        if (p.call(context, x)) {
          result = true;
          throw new BreakControl();
        }
      });
    } catch (e) {
      if (!(e instanceof BreakControl)) {
        throw e;
      }
    }

    return result;
  },
  
  some: function (p, context) {
    return this.exists(p, context);
  },

  find: function (p, context) {
    var result = None;

    try {
      this.forEach(function (x) {
        if (p.call(context, x)) {
          result = Some(x);
          throw new BreakControl();
        }
      });
    } catch (e) {
      if (!(e instanceof BreakControl)) {
        throw e;
      }
    }

    return result;
  },

  // TODO: scan, scanLeft, scanRight

  head: function () {
    var result = function () {
      throw new NoSuchElementException;
    };

    try {
      this.forEach(function (x) {
        result = function () {
          return x;
        };
        throw new BreakControl();
      });
    } catch (e) {
      if (!(e instanceof BreakControl)) {
        throw e;
      }
    }

    return result();
  },

  headOption: function () {
    if (this.isEmpty()) {
      return None;
    } else {
      return Some(this.head())
    }
  },

  tail: function () {
    if (this.isEmpty()) {
      throw new UnsupportedOperationException;
    }
    return this.drop(1)
  },

  last: function () {
    var lst = this.head();

    this.forEach(function (x) {
      lst = x;
    });

    return lst
  },

  lastOption: function () {
    if (this.isEmpty()) {
      return None;
    } else {
      return Some(this.last());
    }
  },

  init: function () {
    if (this.isEmpty()) {
      throw new UnsupportedOperationException;
    }

    var lst = this.head();
    var follow = false;
    var b = this.newBuilder();
    b.sizeHint(this, -1);

    this.forAll(function (x) {
      if (follow) b.add(lst);
      else follow = true;
      lst = x;
    });

    return b.result();
  },

  take: function (n) {
    return this.slice(0, n);
  },

  drop: function (n) {
    if (n <= 0) {
      var b = this.newBuilder();
      b.sizeHint(this);
      return (b.addAll(this)).result();
    } else {
      return sliceWithKnownDelta.call(this, n, Number.POSITIVE_INFINITY, -n)
    }
  },

  slice: function (frm, until) {
    return sliceWithKnownBound.call(this, Math.max(frm, 0), until)
  },

  takeWhile: function (p, context) {
    var b = this.newBuilder();

    try {
      this.forEach(function (x) {
        if (!p.call(context, x)) throw new BreakControl();
        else b.add(x);
      });
    } catch (e) {
      if (!(e instanceof BreakControl)) {
        throw e;
      }
    }

    return b.result();
  },

  dropWhile: function (p, context) {
    var b = this.newBuilder();
    var go = false;

    this.forEach(function (x) {
      if (!go && !p.call(context, x)) go = true;
      if (go) b.add(x);
    });

    return b.result();
  },

  span: function (p, context) {
    var l = this.newBuilder();
    var r = this.newBuilder();
    var toLeft = true;

    this.forEach(function (x) {
      toLeft = toLeft && p.call(context, x);
      (toLeft ? l : r).add(x)
    });

    return t(l.result(), r.result());
  },

  splitAt: function (n) {
    var l = this.newBuilder();
    var r = this.newBuilder();

    l.sizeHintBounded(n, this);
    if (n >= 0) r.sizeHint(this, -n);
    var i = 0;

    this.forEach(function (x) {
      (i < n ? l : r).add(x);
      i++;
    });

    return t(l.result(), r.result());
  }

  // TODO: tails, inits

  // TODO: copyToArray

  // TODO: various toX methods

  // TODO: view

  // TODO: withFilter

  // TODO: _iterateUntilEmpty

});

function sliceInternal(frm, until, b) {
  var i = 0;

  try {
    this.forEach(function (x) {
      if (i >= frm) b.add(x);
      i++;
      if (i >= until) throw new BreakControl();
    });
  } catch (e) {
    if (!(e instanceof BreakControl)) {
      throw e;
    }
  }

  return b.result();
}

// Precondition: frm >= 0
function sliceWithKnownDelta(frm, until, delta) {
  var b = this.newBuilder();
  if (until <= frm) return b.result();
  else {
    b.sizeHint(this, delta);
    return sliceInternal.call(this, frm, until, b);
  }
}

function sliceWithKnownBound(frm, until) {
  var b = this.newBuilder();
  if (until <= frm) return b.result();
  else {
    b.sizeHintBounded(until - frm, this);
    return sliceInternal.call(this, frm, until, b);
  }
}

function filterImpl(p, isFlipped, context) {
  var b = this.newBuilder();

  this.forEach(function (x) {
    if (p.call(context, x) !== isFlipped) b.add(x)
  });

  return b.result();
}

exports.TraversableLike = TraversableLike;
