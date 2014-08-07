var s = require('./global.js').s;

var Any = require('./Any.js').Any;

var Class = require('./lang/Class.js').Class;
var CaseClass = require('./lang/CaseClass.js').CaseClass;

var product = require('./Product.js');
var Product = product.Product;
var Product1 = product.Product1;
var Product2 = product.Product2;
var Product3 = product.Product3;
var getProduct = product.getProduct;

var Tuple1 = CaseClass(function Tuple1(_1) {
}).extends(Product1).body();

var Tuple2 = CaseClass(function Tuple2(_1, _2) {
}).extends(Product2).body();

var Tuple3 = CaseClass(function Tuple3(_1, _2, _3) {
}).extends(Product3).body();

function createTuple(n) {
  var defaults = {};
  for (var i = 1; i <= n; i++) {
    defaults['_' + i] = undefined;
  }
  return CaseClass("Tuple" + n, defaults).extends(getProduct(n)).body();
}

function getTuple(n) {
  if (!s['Tuple' + n]) {
    s['Tuple' + n] = createTuple(n);
  }
  return s['Tuple' + n];
}

function t() {
  return getTuple(arguments.length).apply(undefined, arguments);
}

exports.Tuple1 = Tuple1;
exports.Tuple2 = Tuple2;
exports.Tuple3 = Tuple3;
exports.getTuple = getTuple;
exports.t = t;

for (var i = 4; i <= 22; i++) {
  exports['Tuple' + i] = getTuple(i);
}
