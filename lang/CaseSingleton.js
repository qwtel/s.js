var makeClassBuilder = require('./Class.js').makeClassBuilder;
var makeWithTraitClassBuilder = require('./Class.js').makeWithTraitClassBuilder;

var makeCaseClassBuilder = require('./CaseClass.js').makeCaseClassBuilder;
var makeWithTraitCaseClassBuilder = require('./CaseClass.js').makeWithTraitCaseClassBuilder;

var makeSingletonBuilder = require('./Singleton.js').makeSingletonBuilder;
var makeWithTraitSingletonBuilder = require('./Singleton.js').makeWithTraitCaseClassBuilder;

// Where is your god now?
var WithTraitCaseSingletonBuilder = makeWithTraitSingletonBuilder(makeWithTraitCaseClassBuilder(makeWithTraitClassBuilder()));
var CaseSingletonBuilder = makeSingletonBuilder(makeCaseClassBuilder(makeClassBuilder(WithTraitCaseSingletonBuilder)));

function CaseSingleton(Ctor) {
  return new CaseSingletonBuilder(Ctor);
}

exports.CaseSingleton = CaseSingleton;
