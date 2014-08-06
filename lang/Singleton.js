var makeClassBuilder = require('./Class.js').makeClassBuilder;
var makeWithTraitClassBuilder = require('./Class.js').makeWithTraitClassBuilder;

function makeSingletonBuilder(ClassBuilder) {

  function SingletonBuilder(Ctor) {
    ClassBuilder.call(this, Ctor);
  }

  SingletonBuilder.prototype = Object.create(ClassBuilder.prototype);

  SingletonBuilder.prototype.body = function (body) {
    var Ctor = ClassBuilder.prototype.body.call(this, body); // super.body(body);
    if (!Ctor.instance) {
      Ctor.instance = new Ctor();
    }
    return Ctor.instance;
  };

  return SingletonBuilder;
}

function makeWithTraitSingletonBuilder(WithTraitClassBuilder) {

  function WithTraitCaseClassBuilder(instance) {
    WithTraitClassBuilder.call(this, instance);
  }

  WithTraitCaseClassBuilder.prototype = Object.create(WithTraitClassBuilder.prototype);

  WithTraitCaseClassBuilder.prototype.body = function (body) {
    var Ctor = WithTraitClassBuilder.prototype.body.call(this, body); // super.body(body);
    if (!Ctor.instance) {
      Ctor.instance = new Ctor();
    }
    return Ctor.instance;
  };

  return WithTraitCaseClassBuilder;
}

var WithTraitSingletonBuilder = makeWithTraitSingletonBuilder(makeWithTraitClassBuilder());
var SingletonBuilder = makeSingletonBuilder(makeClassBuilder(WithTraitSingletonBuilder));

function Singleton(Ctor) {
  return new SingletonBuilder(Ctor);
}

exports.makeSingletonBuilder = makeSingletonBuilder;
exports.makeWithTraitSingletonBuilder = makeWithTraitSingletonBuilder;

//exports.SingletonBuilder = SingletonBuilder;
//exports.WithTraitSingletonBuilder = WithTraitSingletonBuilder;

exports.Singleton = Singleton;
