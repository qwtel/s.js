var Class = require('../../lang/Class').Class;
var Trait = require('../../lang/Trait').Trait;

var Growable = require('../generic/Growable').Growable;

var Builder = Trait(function Builder() {}).with(Growable).body({
  add: Trait.required,
  
  clear: Trait.required,
  
  result: Trait.required,
  
  sizeHint: function () {
  },
  
  sizeHintColl: function (coll) {
    if (coll.isInstanceOf('IndexedSeqLike')) 
      this.sizeHint(coll.size());
  },
  
  sizeHintCollDelta: function (coll, delta) {
    if (coll.isInstanceOf('IndexedSeqLike')) 
      this.sizeHint(coll.size() + delta);
  },
  
  sizeHintBounded: function (size, boundingColl) {
    if (boundingColl.isInstanceOf('IndexedSeqLike'))
      this.sizeHint(Math.min(size, boundingColl.size()));
  },
  
  mapResult: function (f, context) {
    var self = this;
    return new (Class().with(Builder).body({
      add: function (x) { self.add(x); return this; },
      clear: self.clear.bind(self),
      addAll: function (xs) { self.addAll(xs); return this; },
      sizeHint: function () { self.sizeHint(); },
      result: function () { return f.call(context, self.result()); }
    }));
  }
});

exports.Builder = Builder;
