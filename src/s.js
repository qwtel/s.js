var Class = require('./lang/Class.js').Class;
var Singleton = require('./lang/Singleton.js').Singleton;
var CaseClass = require('./lang/Class.js').CaseClass;
var CaseSingleton = require('./lang/CaseSingleton.js').CaseSingleton;
var Trait = require('./lang/Trait.js').Trait;

var any = require('./Any.js');
var equals = require('./Equals.js');
var exceptions = require('./Exceptions.js');

var s = {
  Class: Class,
  Singleton: Singleton,
  CaseClass: CaseClass,
  CaseSingleton: CaseSingleton,
  Trait: Trait,
  
  Any: any.Any,
  Equals: equals.Equals
};

module.exports = s;
