var Trait = require('../../lang/Trait').Trait;

var Clearable = Trait(function Clearable() {}).body({
  clear: Trait.required
});

exports.Clearable = Clearable;
