var Trait = require('./lang/Trait.js').Trait;

var Equals = Trait("Equals").body({
  canEqual: Trait.required,
  equals: Trait.required
});

exports.Equals = Equals;
