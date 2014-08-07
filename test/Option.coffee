option = require('../src/Option.js')
Option = option.Option;
Some = option.Some;
None = option.None;

NUM = 1000000

_ = undefined ;

describe 'A Option', ->

  o = _
  n = _

  beforeEach ->
    o = Option(1)
    n = None

  it 'should exist', ->
    expect(Option).toBeDefined()
    expect(Some).toBeDefined()
    expect(None).toBeDefined()

  it 'should be created by a factory function', ->
    expect(o).toBeDefined()
    
  it 'should be instance of Some', ->
    expect(o.isInstanceOf(Some)).toBe(true)
    expect(o.isInstanceOf('Some')).toBe(true)

  it 'should be instance of Option', ->
    expect(o.isInstanceOf(Option)).toBe(true)
    expect(o.isInstanceOf('Option')).toBe(true)

  it 'should be instance of Equals', ->
    expect(o.isInstanceOf('Equals')).toBe(true)
    
  it 'should be instance of Product', ->
    expect(o.isInstanceOf('Product')).toBe(true)
    
  it 'should be instance of Any', ->
    expect(o.isInstanceOf('Any')).toBe(true)

  it 'should not be a instance of None', ->
    expect(o.isInstanceOf('None')).toBe(false)

  it 'should not be empty', ->
    expect(o.isEmpty()).toBe(false)

  it 'should not be defined', ->
    expect(o.isDefined()).toBe(true)

  it "should print as 'Some(1)'", ->
    expect(o.toString()).toBe('Some(1)')
    
  describe 'subtype Some', ->
    
    s = _
    
    beforeEach ->
      s = Some(1)
    
    it 'should be defined', ->
      expect(s).toBeDefined()
      
    it 'should be a instance of Some', ->
      expect(s.isInstanceOf('Some')).toBe(true)
      expect(s.isInstanceOf(Some)).toBe(true)
      
  describe 'subtype None', ->
    
    n = _
    
    beforeEach ->
      n = None
    
    it 'should not be defined', ->
      expect(n).toBeDefined()
      
    it 'should be empty', ->
      expect(n.isEmpty()).toBe(true)
      
    it 'should be a instance of None', ->
      expect(n.isInstanceOf('None')).toBe(true)
      expect(n.isInstanceOf(None)).toBe(true)
      
    it 'should be created by empty on the companion object', ->
      expect(Option.empty()).toEqual(None)
      
  

  it 'should have equality', ->
    expect(Some(1)).toEqual(Some(1))
    expect(Option(3)).toEqual(Option(3))

  it 'should have equality on `None`', ->
    expect(None).toEqual(None)

  it 'should have canEqual', ->
    expect(o.canEqual).toBeDefined()
    expect(o.canEqual('Some')).toBe(true)

  it 'should be `None` when passed `null` or `undefined`', ->
    expect(Option(null)).toEqual(None)
    expect(Option(undefined)).toEqual(None)

  it 'should contain the correct value', ->
    expect(o.get()).toBe(1)
    expect(-> n.get()).toThrow();

  it 'should be able to store null in `Some`', ->
    expect(Some(null).get()).toEqual(null)

  it 'should have a working `getOrElse` implementation', ->
    expect(o.getOrElse(2)).toBe(1)
    expect(n.getOrElse(2)).toBe(2)

  it 'should have a working `orNull` implementation', ->
    expect(o.orNull()).toBe(1)
    expect(n.orNull()).toBe(null)
  
  plusOne = (x) -> x + 1
  
  it 'should have a working `map` implementation', ->
    expect(o.map(plusOne)).toEqual(Some(2))
    expect(n.map(plusOne)).toEqual(None)
  
  it 'should have a working `fold` implementation', ->
    expect(o.fold(0)(plusOne)).toBe(2)
    expect(n.fold(0)(plusOne)).toBe(0)
  
  it 'should have a working `flatMap` implementation', ->
    expect(o.flatMap((x) -> Some(x + 1))).toEqual(Some(2))
    expect(n.flatMap((x) -> Some(x + 1))).toEqual(None)
  
  it 'should have a working `flatten` implementation', ->
    expect(Option(Option(1)).flatten()).toEqual(Option(1))
    expect(None.flatten()).toEqual(None)
  
  gtZero = (x) -> x > 0
  gtOne = (x) -> x > 1
  
  it 'should have a working `filter` implementation', ->
    expect(o.filter(gtZero)).toEqual(Some(1))
    expect(o.filter(gtOne)).toEqual(None)
    expect(n.filter(gtZero)).toEqual(None)
  
  it 'should have a working `filterNot` implementation', ->
    expect(o.filterNot(gtZero)).toEqual(None)
    expect(o.filterNot(gtOne)).toEqual(Some(1))
    expect(n.filterNot(gtZero)).toEqual(None)
  
  it 'should have a working `withFilter` implementation', ->
    expect(o.withFilter(gtZero).map(plusOne)).toEqual(Some(2))
    expect(o.withFilter(gtOne).map(plusOne)).toEqual(None)
    expect(n.withFilter(gtOne).map(plusOne)).toEqual(None)
    expect(o.withFilter(gtZero).withFilter(gtOne).map(plusOne)).toEqual(None)
    expect(Some(2).withFilter(gtZero).withFilter(gtOne).map(plusOne)).toEqual(Some(3))
    expect(Some(3).withFilter(gtZero).withFilter(gtOne).withFilter((x) -> x > 2).map(plusOne)).toEqual(Some(4))
    expect(n.withFilter(gtZero).map(plusOne)).toEqual(None)
    expect(n.withFilter(gtZero).withFilter(gtOne).map(plusOne)).toEqual(None)
  
  it 'should have a working `contains` implementation', ->
    expect(o.contains(1)).toBe(true)
    expect(o.contains(2)).toBe(false)
    expect(Option(Some(1)).contains(Some(1))).toBe(true)
    expect(n.contains(1)).toBe(false)
    expect(n.contains(null)).toBe(false)
  
  it 'should have a working `exists` implementation', ->
    expect(o.exists((x) -> x is 1)).toBe(true)
    expect(o.exists((x) -> x is 2)).toBe(false)
    expect(n.exists((x) -> x is 1)).toBe(false)
    expect(n.exists((x) -> x is 2)).toBe(false)
  
  it 'should have a working `forAll` implementation', ->
    expect(o.forAll((x) -> x is 1)).toBe(true)
    expect(o.forAll((x) -> x is 2)).toBe(false)
    expect(n.forAll((x) -> x is 1)).toBe(true)
    expect(n.forAll((x) -> x is 2)).toBe(true)
  
  it 'should have a working `forEach` implementation', ->
    f = jasmine.createSpy('f');
    o.forEach(f)
    expect(f).toHaveBeenCalled()
  
    g = jasmine.createSpy('g');
    n.forEach(g)
    expect(g).not.toHaveBeenCalled()
  
  
  it 'should have a working `orElse` implementaton', ->
    expect(o.orElse(Some(3))).toEqual(o)
    expect(n.orElse(Some(3))).toEqual(Some(3))

###
# result gets skewed by the code that gets generated by coffeescirpt
it 'should not take more than 5x longer to construct ' + NUM + ' Options than to construct ' + NUM + ' empty objects', ->
i = 0
t1 = time ->
  while i < NUM
    Option(i++)

i = 0
t2 = time ->
  while i < NUM
    i++
    {}

console.log(t1, t2)
expect(t1).toBeLessThan(t2 * 5)
###
