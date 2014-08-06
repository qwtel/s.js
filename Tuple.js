var __ = require('./__.js');

var Any = require('./Any.js').Any;
var Class = require('./lang/Class.js').Class;
var Trait = require('./lang/Trait.js').Trait;

var product = require('./Product.js');
var Product = product.Product;
var Product1 = product.Product1;
var Product2 = product.Product2;
var Product3 = product.Product3;
var getProduct = product.getProduct;

var Tuple1 = Class(function Tuple1(_1) {
  this._1 = _1;
}).with(Product1).body();

var Tuple2 = Class(function Tuple2(_1, _2) {
  this._1 = _1;
  this._2 = _2;
}).with(Product2).body();

var Tuple3 = Class(function Tuple3(_1, _2, _3) {
  this._1 = _1;
  this._2 = _2;
  this._3 = _3;
}).with(Product3).body();

function createTuple(n) {
  return Class("Tuple" + n).with(getProduct(n)).body({
    constructor: function () {
      for (var i = 1; i <= arguments.length; i++) {
        this['_' + i] = arguments[i];
      }
    }
  });
}

function getTuple(n) {
  if (!__['Tuple' + n]) {
    __['Tuple' + n] = createTuple(n);
  }
  return __['Tuple' + n];
}

exports.Tuple1 = Tuple1;
exports.Tuple2 = Tuple2;
exports.Tuple3 = Tuple3;
exports.getTuple = getTuple;

for (var i = 4; i <= 22; i++) {
  exports['Tuple' + i] = createTuple(i);
}
