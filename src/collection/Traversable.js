var Trait = require('../lang/Trait').Trait;

var TraversableLike = require('./TraversableLike').TraversableLike;

var Traversable = Trait(function Traversable() {}).with(TraversableLike).body({
  seq: function () {
    return this;
  }
});

exports.Traversable = Traversable;
