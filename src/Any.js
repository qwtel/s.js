var isString = require('./lang/common/typeCheck.js').isString;

function Any() {
}

Any.prototype = {
  name: 'Any',

  __Any__: true,

  // TODO: less fuckup
  isInstanceOf: function (classLike) {
    if (isString(classLike)) {
      return this['__' + classLike + '__'] === true;
    } else if (classLike.__name__) {
      return this['__' + classLike.__name__ + '__'] === true;
    } else if (classLike.prototype.__name__) {
      return this['__' + classLike.prototype.__name__ + '__'] === true;
    } else if (classLike.__product__) {
      return this['__' + classLike.__product__ + '__'] === true;
    } else {
      return this instanceof classLike;
    }
  },

  getClass: function () {
    return this.name
  }
};

exports.Any  = Any;
