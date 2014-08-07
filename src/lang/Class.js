var Any = require('../Any.js').Any;

var extend = require('./common/extend.js').extend;
var isString = require('./common/typeCheck.js').isString;
var isFunction = require('./common/typeCheck.js').isFunction;

function makeClassBuilder(WithTraitClassBuilder) {
  function ClassBuilder(Ctor, name) {
    if (isFunction(Ctor)) {
      this.Ctor = Ctor;
      name = name || Ctor.name;
    } else {
      this.Ctor = function Class() {
        if (this.constructor) {
          this.constructor.apply(this, arguments);
        }
      };
      name = Ctor
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
      this.Ctor.prototype.__name__ = this.name;
      return this.Ctor;
    },

    extendz: function (Parent) {
      this.Ctor.prototype = Object.create(Parent.prototype);

      if (!Parent.__Any__) {
        extend(this.Ctor.prototype, Any.prototype);
      }

      this.Ctor.prototype['__' + this.name + '__'] = true;

      return new WithTraitClassBuilder(this);
    },

    'extends': function (Parent) {
      return this.extendz(Parent);
    },

    withz: function (trt) {
      extend(this.Ctor.prototype, trt.prototype);
      return new WithTraitClassBuilder(this);
    },

    'with': function (trt) {
      if (isFunction(trt)) { // Traits are functions
        return this.withz(trt);
      } else {
        return this.body(trt);
      }
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
      this.Ctor.prototype.__name__ = this.name;
      return this.Ctor;
    },

    withz: function (trt) {
      extend(this.Ctor.prototype, trt.prototype);
      return this;
    },

    'with': function (trt) {
      if (isFunction(trt)) { // Traits are functions
        return this.withz(trt);
      } else {
        return this.body(trt);
      }
    }
  };

  return WithTraitClassBuilder;
}

var WithTraitClassBuilder = makeWithTraitClassBuilder();
var ClassBuilder = makeClassBuilder(WithTraitClassBuilder);

function Class(Ctor, name) {
  return new ClassBuilder(Ctor, name);
}

exports.makeClassBuilder = makeClassBuilder;
exports.makeWithTraitClassBuilder = makeWithTraitClassBuilder;

//exports.ClassBuilder = ClassBuilder;
//exports.WithTraitClassBuilder = WithTraitClassBuilder;

exports.Class = Class;
