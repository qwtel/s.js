var isInstanceOf = require('./lang/common/isInstanceOf.js').isInstanceOf;

function Any() {
}

Any.prototype = {
  name: 'Any',

  __Any__: true,

  isInstanceOf: function (classLike) {
    return isInstanceOf(this, classLike);
  },

  getClass: function () {
    return this.__name__;
  }
};

exports.Any  = Any;
