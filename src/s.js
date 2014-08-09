var s = require('./global.js').s;

var extend = require('./lang/common/extend.js').extend;

var lang = require('./lang.js');

var exception = require('./lang/exception.js');

var product = require('./Product.js');
var tuple = require('./Tuple.js');

var option = require('./Option.js');

var any = require('./Any.js');
var equals = require('./Equals.js');

var common = require('./lang/common.js');

s.common = common;
s = extend(s, lang);
s = extend(s, exception);
s = extend(s, product);
s = extend(s, tuple);
s = extend(s, option);
s = extend(s, {
  _: undefined,
  Any: any.Any,
  Equals: equals.Equals
});

module.exports = s;
