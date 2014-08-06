var Any = require('../Any.js').Any;

var extend = require('./common/extend.js').extend;
var isString = require('./common/typeCheck.js').isString;
var isFunction = require('./common/typeCheck.js').isFunction;

function makeClassBuilder(WithTraitClassBuilder) {
  function ClassBuilder(name) {
    if (isFunction(name)) {
      this.Ctor = name;
      name = name.name;
    } else {
      this.Ctor = function () {
        if (this.constructor) {
          this.constructor.apply(this, arguments);
        }
      };
    }

    this.name = name;
    this.Ctor.prototype = Object.create(Any.prototype);
    this.Ctor.prototype['__' + this.name + '__'] = true;
  }

  ClassBuilder.prototype = {
    body: function (body) {
      body = body || {};
      extend(this.Ctor.prototype, body);
      this.Ctor.prototype.name = this.name;
      return this.Ctor;
    },

    extends: function (Parent) {
      this.Ctor.prototype = Object.create(Parent.prototype);

      if (!Parent.__Any__) {
        extend(this.Ctor.prototype, Any.prototype);
      }

      this.Ctor.prototype['__' + this.name + '__'] = true;

      return new WithTraitClassBuilder(this);
    },

    with: function (trt) {
      extend(this.Ctor.prototype, trt);
      return new WithTraitClassBuilder(this);
    }
  };

  return ClassBuilder;
}

function makeWithTraitClassBuilder() {
  function WithTraitClassBuilder(instance) {
    this.name = instance.name;
    this.Ctor = instance.Ctor;
  }

  WithTraitClassBuilder.prototype = {
    body: function (body) {
      body = body || {};
      extend(this.Ctor.prototype, body);
      this.Ctor.prototype.name = this.name;
      return this.Ctor;
    },

    with: function (trt) {
      extend(this.Ctor.prototype, trt);
      return this;
    }
  };
  
  return WithTraitClassBuilder;
}

var WithTraitClassBuilder = makeWithTraitClassBuilder();
var ClassBuilder = makeClassBuilder(WithTraitClassBuilder);

function Class(name, Ctor) {
  return new ClassBuilder(name, Ctor);
}

exports.makeClassBuilder = makeClassBuilder;
exports.makeWithTraitClassBuilder = makeWithTraitClassBuilder;

//exports.ClassBuilder = ClassBuilder;
//exports.WithTraitClassBuilder = WithTraitClassBuilder;

exports.Class = Class;
