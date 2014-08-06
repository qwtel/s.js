var lang = require('./lang.js');

var Class = lang.Class;
var Singleton = lang.Singleton;
var CaseClass = lang.CaseClass;
var CaseSingleton = lang.CaseSingleton;
var Trait = lang.Trait;

var exception = require('./lang/exception.js');

var any = require('./Any.js');
var equals = require('./Equals.js');
var option = require('./Option.js');

var s = {
  _: undefined,
  
  Class: Class,
  Singleton: Singleton,
  CaseClass: CaseClass,
  CaseSingleton: CaseSingleton,
  Trait: Trait,
  
  Any: any.Any,
  Equals: equals.Equals,
  
  Option: option.Option,
  Some: option.Some,
  None: option.None
};

module.exports = s;
