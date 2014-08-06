var isString = require('./lang/common/typeCheck.js').isString;

function Any() {
}

Any.prototype = {
  name: 'Any',

  __Any__: true,

  isInstanceOf: function (classLike) {
    if (isString(classLike)) {
      return this['__' + classLike + '__'] === true;
    } else if (classLike.name) {
      return this['__' + classLike.name + '__'] === true;
    } else {
      return this instanceof classLike;
    }
  },

  getClass: function () {
    return this.name
  }
};

exports.Any  = Any;
