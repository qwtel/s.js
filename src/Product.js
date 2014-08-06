var Any = require('./Any.js').Any;
var Class = require('./lang/Class.js').Class;
var Equals = require('./Equals.js').Equals;
var IndexOutOfBoundsException = require('./Exceptions.js').IndexOutOfBoundsException;
var Trait = require('./lang/Trait.js').Trait;

var equals = require('./lang/common/equals.js').equals;

var Product = Trait("Product").with(Equals).body({
  productElement: function (n) {
    if (n < this.productArity()) {
      return this['_' + (n + 1)];
    } else {
      throw new IndexOutOfBoundsException(n);
    }
  },

  productArity: Trait.required,

  productIterator: function () {
    var self = this;
    var c = 0;
    var cmax = self.productArity();
    return new (Class(AbstractIterator).body({
      hasNext: function () {
        return c < cmax;
      },
      next: function () {
        var result = self.productElement(c);
        c++;
        return result;
      }
    }));
  },
  
  // Hacky implementation, good enough for now
  toString: function () {
    var values = [];
    for (var i = 0; i < this.productArity(); i++) {
      values.push(this.productElement(i).toString());
    }
    return this.productPrefix + '(' + values.join(',') + ')';
  },
  
  canEqual: function (that) {
    return that.isInstanceOf(this.getClass());
  },
  
  equals: function (other) {
    if (other.__Product__) {
      if (this.productArity() === other.productArity()) {
        var res = true;
        for (var i = 0; i < this.productArity(); i++) {
          res = res && equals(this.productElement(i), other.productElement(i))
        }
        return res
      }
    }
    return false;
  },
  
  // ???
  productPrefix: ''

});

var Product1 = Trait("Product1").with(Product).body({
  productArity: function () {
    return 1;
  },

  _1: Trait.required
});

var Product2 = Trait("Product2").with(Product).body({
  productArity: function () {
    return 2;
  },

  _1: Trait.required,
  _2: Trait.required
});

var Product3 = Trait("Product3").with(Product).body({
  productArity: function () {
    return 3;
  },

  _1: Trait.required,
  _2: Trait.required,
  _3: Trait.required
});

function createProduct(n) {
  var body = {
    productArity: function () {
      return n;
    }
  };

  for (var i = 1; i <= n; i++) {
    body['_' + i] = Trait.required;
  }

  return Trait("Product" + n).with(Product).body(body);
}

var __ = {};
function getProduct(n) {
  if (!__['Product' + n]) {
    __['Product' + n] = createProduct(n);
  }
  return __['Product' + n];
}

exports.Product = Product;
exports.Product1 = Product1;
exports.Product2 = Product2;
exports.Product3 = Product3;
exports.getProduct = getProduct;

for (var i = 4; i <= 22; i++) {
  exports['Product' + i] = createProduct(i);
}