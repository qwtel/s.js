var Trait = require('../../lang/Trait').Trait;

var Shrinkable = Trait(function Shrinkable() {}).with({
  remove: Trait.required,
  
  removeAll: function (xs) {
    xs.forEach(this.remove.bind(this));
    return this;
  }
});

exports.Shrinkable = Shrinkable;
