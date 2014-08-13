var Trait = require('../lang/Trait').Trait;

var UnsupportedOperationException = require('../lang/exception').UnsupportedOperationException;

var TraversableOnce = Trait(function TraversableOnce() {
}).body({
  forEach: Trait.required,
  isEmpty: Trait.required,
  hasDefiniteSize: Trait.required,
  
  seq: Trait.required,
  
  forAll: Trait.required,
  exists: Trait.required,
  find: Trait.required,
  // TODO: copy to array

  reversed: function () {
    // TODO
    console.warn('reversed not implemented');
    return this
  },

  // TODO: copyToArray

  size: function () {
    var result = 0;
    this.forEach(function() {
      result++;
    });
    return result;
  },

  nonEmpty: function () {
    return !this.isEmpty();
  },

  count: function (p, context) {
    var cnt = 0;
    this.forEach(function(x) {
      if (p.call(context, x)) cnt++;
    });
    return cnt;
  },
  
  // TODO: make more like js api

  foldLeft: function (z) {
    return function (op, context) {
      var result = z;
      this.forEach(function(x) {
        result = op.call(context, result, x);
      });
      return result;
    }.bind(this);
  },
  
  /*
  reduce: function (op, z, context) {
    return this.foldLeft(z)(op, context);
  },
  */

  foldRight: function (z) {
    return function (op, context) {
      return this.reversed().foldLeft(z)(function(x, y) {
        return op.call(context, x, y);
      })
    }.bind(this);
  }
  
  /*
  reduceRight: function (op, z, context) {
    return this.foldRight(z)(op, context);
  }
  */
  
  /*
  min: function () {
    if (this.isEmpty())
      throw new UnsupportedOperationException("empty.min");
    
    return this.reduceLeft(function (x, y) { return x <= y ? x : y })
  },
  
  max: function () {
    if (this.isEmpty())
      throw new UnsupportedOperationException("empty.min");
    
    return this.reduceLeft(function (x, y) { return x >= y ? x : y })
  }
  */

});

exports.TraversableOnce = TraversableOnce;
