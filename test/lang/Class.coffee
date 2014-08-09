Any = require('../../src/Any.js').Any
Class = require('../../src/lang/Class.js').Class
Trait = require('../../src/lang/Trait.js').Trait

isFunction = require('../../src/lang/common.js').isFunction

_ = undefined

describe 'Class', ->
  it 'should exist', ->
    expect(Class).toBeDefined()
    
  it 'should be a function', ->
    expect(isFunction(Class)).toBe true
    
  describe 'Foo', ->
    Foo = _
    
    beforeEach ->
      Foo = Class('Foo').body(
        constructor: (name) -> @name = name
        foo: -> 'foo'
      )
      
    it "should create a js 'class'", ->
      expect(Foo).toBeDefined()

    it "should be a function", ->
      expect(isFunction(Foo)).toBe true
    
    describe 'foo', ->
      foo = _
      
      beforeEach ->
        foo = new Foo('john doe')
        
      it 'should be able to instantiate a Foo', ->
        expect(foo).toBeDefined()
  
      it 'should have class Foo', ->
        expect(foo.getClass()).toBe 'Foo'
        
      it 'should be a instance of Foo (string)', ->
        expect(foo.isInstanceOf('Foo')).toBe true
        
      it 'should be a instance of Foo (constructor)', ->
        expect(foo.isInstanceOf(Foo)).toBe true
        
      it 'should be a instance of Any (string)', ->
        expect(foo.isInstanceOf('Any')).toBe true
        
      it 'should have a foo method', ->
        expect(foo.foo).toBeDefined()
        expect(foo.foo()).toBe 'foo'
        
      it 'the constructor should have been called', ->
        expect(foo.name).toBe('john doe')
        
    describe 'Bar', ->
      Bar = _
      
      beforeEach ->
        Bar = Class('Bar').extendz(Foo).body({
          # TODO: Support __super__ or sumting
          # Foo.call(this, ...) is not possible, because `this.constructor` is overridden...
          constructor: (name) -> Foo.prototype.constructor.call(this, name)
          bar: -> 'bar'
        })
        
      it "should create a js 'class'", ->
        expect(Bar).toBeDefined()
  
      it "should be a function", ->
        expect(isFunction(Bar)).toBe true
        
      describe 'bar', ->
        bar = _
        
        beforeEach ->
          bar = new Bar('john doe')

        it 'should be able to instantiate a Bar', ->
          expect(bar).toBeDefined()
          
        it 'should have class Bar', ->
          expect(bar.getClass()).toBe 'Bar'

        it 'should be a instance of Bar (string)', ->
          expect(bar.isInstanceOf('Bar')).toBe true
          
        it 'should be a instance of Foo (string)', ->
          expect(bar.isInstanceOf('Foo')).toBe true

        it 'should be a instance of Bar (constructor)', ->
          expect(bar.isInstanceOf(Bar)).toBe true
          
        it 'should be a instance of Foo (constructor)', ->
          expect(bar.isInstanceOf(Foo)).toBe true
          
        it 'should have a foo method', ->
          expect(bar.foo).toBeDefined()
          expect(bar.foo()).toBe 'foo'
          
        it 'should have a bar method', ->
          expect(bar.bar).toBeDefined()
          expect(bar.bar()).toBe 'bar'

        it 'should call the constructor', ->
          expect(bar.name).toBe('john doe')
          
        it 'should have its prototype set', ->
          expect(bar instanceof Bar).toBe true
          
        it 'should have its prototype chain set up', ->
          expect(bar instanceof Foo).toBe true
          
        it 'should have its prototype chain set up until reaching `Any`', ->
          expect(bar instanceof Any).toBe true

  it 'should be able to use the extends method', ->
    Foo = Class('Foo').body()
    Bar = Class('Bar').extends(Foo).body()
    bar = new Bar
    expect(bar.isInstanceOf(Foo))
    
  it 'should be able to leave out the `body` call', ->
    Foo = Class('Foo').with({
      foo: -> 'foo'
    })
    
    expect(isFunction(Foo)).toBe(true)
    
    foo = new Foo
    expect(foo).toBeDefined()
    expect(foo.foo()).toBe('foo')
    expect(foo.getClass()).toBe("Foo")
    
  it 'should be able to extend a Trait', ->
    Bar = Trait('Bar').body()
    
    Foo = Class('Foo').extends(Bar).with({
      foo: -> 'foo'
    })
    
    expect(isFunction(Foo)).toBe true
    
    foo = new Foo
    expect(foo).toBeDefined()
    expect(foo.foo()).toBe('foo')
    expect(foo.getClass()).toBe("Foo")
    
    expect(foo.isInstanceOf('Bar')).toBe true
    expect(foo.isInstanceOf(Bar)).toBe true
    
    expect(foo.isInstanceOf('Foo')).toBe true
    expect(foo.isInstanceOf(Foo)).toBe true
    
    expect(foo.isInstanceOf('Any')).toBe true
    expect(foo.isInstanceOf(Any)).toBe true
    
    expect(Bar.prototype.foo).not.toBeDefined()
    
    expect(foo instanceof Foo).toBe true
    expect(foo instanceof Bar).toBe true
    expect(foo instanceof Any).toBe true
    
  describe 'advanced inheritance', ->
    it 'should be able to call the super constructor', ->
      Foo = Class('Foo').body
        constructor: (x) -> @x = x
        
      Bar = Class('Bar').extends(Foo).body
        constructor: (x, y) -> 
          @__super__(x)
          @y = y
          
      bar = new Bar(1,2)
      
      expect(bar.x).toBe(1)
      expect(bar.y).toBe(2)
      
    it 'should be able to call a specific super methods', ->
      Foo = Trait('Foo').body
        common: -> 'foo'
          
      Bar = Trait('Bar').body
        common: -> 'bar'
          
      FooBar = Class('FooBar').extends(Foo).with(Bar).body
        foo: -> @__supers__['Foo'].common.call(this)
        bar: -> @__supers__['Bar'].common.call(this)
        
      fooBar = new FooBar()
      
      expect(fooBar.foo()).toBe('foo')
      expect(fooBar.bar()).toBe('bar')
      
      
      
    
