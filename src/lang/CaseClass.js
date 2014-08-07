var Any = require('../Any.js').Any;

var makeClassBuilder = require('./Class.js').makeClassBuilder;
var makeWithTraitClassBuilder = require('./Class.js').makeWithTraitClassBuilder;

var caseClassify = require('./common/caseClassify.js').caseClassify;

var isFunction = require('./common/typeCheck.js').isFunction;
var isString = require('./common/typeCheck.js').isString;
var isArray = require('./common/typeCheck.js').isArray;
var isObject = require('./common/typeCheck.js').isObject;

function getName(fn) {
  // TODO: Cross-browser?
  return fn.name;
}

function makeCaseClassBuilder(ClassBuilder) {

  function CaseClassBuilder(name, Ctor) {
    if (isFunction(name)) {
      this.Ctor = name;
      this.name = getName(this.Ctor);
    }
    else if (isString(name)) {
      this.Ctor = function CaseClass() {
        if (this.constructor) {
          this.constructor.apply(this, arguments);
        }
      };
      this.name = name;
    }
    else {
      throw Error("wrong")
    }

    if (isObject(Ctor)) {
      this.defaults = Ctor;
    }

    this.Ctor.prototype = Object.create(Any.prototype);
    this.Ctor.prototype['__' + this.name + '__'] = true;
  }

  CaseClassBuilder.prototype = Object.create(ClassBuilder.prototype);

  CaseClassBuilder.prototype.body = function (body) {
    var Ctor = ClassBuilder.prototype.body.call(this, body); // super.body(body);
    return caseClassify(Ctor, this.name, this.defaults);
  };

  return CaseClassBuilder;
}

function makeWithTraitCaseClassBuilder(WithTraitClassBuilder) {

  function WithTraitCaseClassBuilder(instance) {
    this.name = instance.name;
    this.Ctor = instance.Ctor;
    this.defaults = instance.defaults;
  }

  WithTraitCaseClassBuilder.prototype = Object.create(WithTraitClassBuilder.prototype);

  WithTraitCaseClassBuilder.prototype.body = function (body) {
    var Ctor = WithTraitClassBuilder.prototype.body.call(this, body); // super.body(body);
    return caseClassify(Ctor, this.name, this.defaults);
  };

  return WithTraitCaseClassBuilder;
}

var WithTraitCaseClassBuilder = makeWithTraitCaseClassBuilder(makeWithTraitClassBuilder());
var CaseClassBuilder = makeCaseClassBuilder(makeClassBuilder(WithTraitCaseClassBuilder));

function CaseClass(name, Ctor) {
  return new CaseClassBuilder(name, Ctor);
}

exports.makeWithTraitCaseClassBuilder = makeWithTraitCaseClassBuilder;
exports.makeCaseClassBuilder = makeCaseClassBuilder;

//exports.CaseClassBuilder = CaseClassBuilder;
//exports.WithTraitCaseClassBuilder = WithTraitCaseClassBuilder;

exports.CaseClass = CaseClass;
