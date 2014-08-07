# s.js

Adding functional stuff to vanilla JavaScript.
Formerly known as "scala-ish.js".

## Highlights

Here are some common things you can do with s.js:

### Sane exceptions

Writing custom exceptions in JavaScript is hard.
Here is how you do it with s.js.
Complete with stack trace and everything.

    var MyException = Class("MyException").extends(RuntimeException).body();
    throw new MyException("My description");

### Options

You want them.

    Option(maybeNull).map(function(x) {
      return x + 1;
    }).getOrElse(0);
    
### Case classes

Yup.

    var Foo = CaseClass("Foo", { a: 0, b: 0, c: 0 }).body({
      foo: function () { return this.a + this.b + this.c })
    });
    
    var foo = Foo(1,2,3);
    foo.foo() // => 6
    
    var otherFoo = Foo(1,2,3);
    foo.equals(otherFoo) // => true
    
    var fooCopy = foo.copy({a: 2, c: 5});
    fooCopy.c // => 5
    
    fooCopy.toJSON() // => {a: 2, b: 2, c: 5};
    Foo.fromJSON({a: 1, b: 2, c: 3}) // => Foo(1,2,3)
    
    fooCopy.toString() // => "Foo(2,2,5)"
    
    var Bar = CaseClass(function Bar(a, b, c) {}).extendz(Foo).body({
      bar: function () { return this.foo() + this.a + this.b + this.c })
    });
    
    var bar = Bar(1,2,3)
    bar.bar() // => 12
    
    bar.equals(foo) // => false
    
    Foo.app(1,2,3) // => Foo(1,2,3)
    Foo.unApp(foo) // => [1,2,3]
    
### Pseudo pattern matching*

\* Still pretty hacky

    var res = fooCopy.match()
      .case(Foo, function(a, b, c) {
        return c - a - b;
      })
      .case(undefined, function () {
        return 0;
      }) // => 1

### Tuples

More semantic than array literals. 
Just as easy to create with the `t` function.
Thank you `s`.

    var data = t("String", 1) // => Tuple2
    data._1 // => "String"
    data._2 // => 1
    data.toString() // => "Tuple2(String,1)"
    
    t(1,2,3,4,5,6,7) => Tuple7
  
Up to infinity.

### Traits

Not as academic as [traits.js](http://soft.vub.ac.be/~tvcutsem/traitsjs/). 
Faster though.

    var Fooable = Trait("Fooable").body({
      foo: function() { return 'foo' }
    });
    
    var Barable = Trait("Barable").body({
      foo: Trait.required,
      bar: function() { return this.foo() + ' bar' }
    });
    
    // TODO: Don't let Trait.required override stuff
    var FooBar = Class("FooBar").extends(Barable).with(Fooable).body({
      fooBar: function () { return this.bar() }
    });
    
    var fooBar = new FooBar();
    fooBar.fooBar() // => "foo bar"
    
### Singletons

    var FooService = Singleton("FooService").with(Fooable).body({
      callFoo: function () { return this.foo() }
    });
    
    FooService.callFoo();
    
### Lists

TODO

### Other containers

TODO

### Wrapped stuff

TODO, but here is how it's going to work.

    var wrappedNumber = w(1) // => WrappedNumber
    w(1).to(3) // => Range(1,2,3)

    var wrappedString = w("some string") // => WrappedString
    wrappedString.startsWith("some") // => true
    
    var wrappedArray = w([1,2,1]) // => WrappedArray
    wrappedArray.groupBy(function(elem) { return elem }) // => {1: [1, 1], 2: [2]}
    
### Pseudo for-comprehensions

For comic relieve only.

    For(
      w(0).until(3), 
      w(0).until(3)
    ).yield(function(x, y) { 
      return x + y 
    }) // => ?(0, 1, 2, 1, 2, 3, 2, 3, 4)
    
[Atwood's Law](http://en.wikipedia.org/wiki/Jeff_Atwood#cite_ref-6).

## Disclaimer

This is experimental software. No warranties. 

Don't touch the `__(.*)__` fields.  They are all going to change.
