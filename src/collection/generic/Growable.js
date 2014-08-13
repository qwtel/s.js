var Trait = require('../../lang/Trait').Trait;

var Clearable = require('./Clearable').Clearable;

var Growable = Trait(function Growable() {}).with(Clearable).with({
  add: Trait.required,
  
  addAll: function (xs) {
    xs.forEach(this.add.bind(this));
    return this;
  },
  
  clear: Trait.required
});

exports.Growable = Growable;

