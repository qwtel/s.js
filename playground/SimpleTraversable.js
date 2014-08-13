var Class = require('../src/lang/Class').Class;
var Singleton = require('../src/lang/Singleton').Singleton;
var Builder = require('../src/collection/mutable/Builder').Builder;
var Traversable = require('../src/collection/Traversable').Traversable;

var SimpleTraversable = Class('SimpleTraversable').with(Traversable).body({
  constructor: function(arr) {
    this._elems = arr;
  },
  
  forEach: function(f, context) {
    this._elems.forEach(f, context)
  },
  
  newBuilder: function () {
    return new (Class().with(Builder).body({
      constructor: function () {
        this._elems = [];
      },

      add: function (x) {
        this._elems.push(x);
        return this;
      }, 
      
      result: function () {
        return new SimpleTraversable(this._elems);
      },
      
      clear: function () {
        this._elems = [];
        return this;
      }
    }));
  },
  
  buildFrom: function (clazz) {
    if (clazz === 'SimpleTraversable') {
      return this.newBuilder();
    } else {
      throw Error("Can't build from " + clazz);
    }
  }
});

exports.SimpleTraversable = SimpleTraversable;

