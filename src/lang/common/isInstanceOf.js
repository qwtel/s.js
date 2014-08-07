var isString = require('./typeCheck.js').isString;

// TODO: less fuckup
function isInstanceOf(that, classLike) {
  if (isString(classLike)) {
    return that['__' + classLike + '__'] === true;
  } else if (classLike.__name__) {
    return that['__' + classLike.__name__ + '__'] === true;
  } else if (classLike.prototype.__name__) {
    return that['__' + classLike.prototype.__name__ + '__'] === true;
  } else if (classLike.__product__) {
    return that['__' + classLike.__product__ + '__'] === true;
  } else {
    return that instanceof classLike;
  }
}

exports.isInstanceOf = isInstanceOf;
