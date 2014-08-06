Class = require('../../src/lang/Class.js').Class

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
      Foo = Class('Foo').body()
      
    it "should create a js 'class'", ->
      expect(Foo).toBeDefined()

    it "should be a function", ->
      expect(isFunction(Foo)).toBe true
    
    describe 'foo', ->
      foo = _
      
      beforeEach ->
        foo = new Foo
        
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
