var Class = require('./lang/Class.js').Class;
var Singleton = require('./lang/Singleton.js').Singleton;
var CaseClass = require('./lang/CaseClass.js').CaseClass;
var CaseSingleton = require('./lang/CaseSingleton.js').CaseSingleton;
var Trait = require('./lang/Trait.js').Trait;

var lang = {
  Class: Class,
  Singleton: Singleton,
  CaseClass: CaseClass,
  CaseSingleton: CaseSingleton,
  Trait: Trait
};

module.exports = lang;
