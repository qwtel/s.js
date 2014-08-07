Any = require('../../src/Any.js').Any
CaseClass = require('../../src/lang/CaseClass.js').CaseClass
Trait = require('../../src/lang/Trait.js').Trait

isFunction = require('../../src/lang/common.js').isFunction

_ = undefined

describe 'CaseClass', ->
  it 'should exist', ->
    expect(CaseClass).toBeDefined()

  it 'should be a function', ->
    expect(isFunction(CaseClass)).toBe true

  describe 'Foo', ->
    Foo = _

    beforeEach ->
      Foo = CaseClass('Foo', {a: 1, b: 2}).body(
        foo: -> a + b
      )

    it "should create a js 'class'", ->
      expect(Foo).toBeDefined()
      
    it 'should be a function', ->
      expect(isFunction(Foo)).toBe true
      
    it 'should be instantiable', ->
      foo = Foo(1, 2)
      expect(foo).toBeDefined()
      
    describe 'foo', ->
      foo = _
      
      beforeEach ->
        foo = Foo(1, 2)
        
      it 'should have properties', ->
        expect(foo.a).toBeDefined()
        expect(foo.b).toBeDefined()
        
      it 'should have the correct properties', ->
        expect(foo.a).toBe(1)
        expect(foo.b).toBe(2)

      it 'should have equality', ->
        foo2 = Foo()
        expect(foo2.equals(foo)).toBe(true)
        
      it 'should have equality', ->
        Bar = CaseClass('Bar', {a: 1, b: 2}).body()
        bar = Bar()
        expect(bar.equals(foo)).toBe(false)
        
    it 'should have defaults', ->
      foo = Foo()
      expect(foo.a).toBe 1
      expect(foo.b).toBe 2
