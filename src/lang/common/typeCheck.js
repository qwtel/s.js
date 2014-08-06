['Function', 'String', 'Number']
  .forEach(function (name) {
    exports['is' + name] = function (obj) {
      return typeof obj === name.toLowerCase();
    }
  });
