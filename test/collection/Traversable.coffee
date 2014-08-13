Class = require('../../src/lang/Class').Class;

Traversable = require('../../src/collection/Traversable').Traversable
Builder = require('../../src/collection/mutable/Builder').Builder

_ = undefined

describe 'Traversable', ->
  it 'should exist', ->
    expect(Traversable).toBeDefined()
    
  describe 'simple implementation', ->

    SimpleTraversable = require('../../playground/SimpleTraversable').SimpleTraversable
    
    emptyTrav = new SimpleTraversable([])
    trav = new SimpleTraversable([1, 2, 3])

    it 'should exist', ->
      expect(trav).toBeDefined()
      
    it 'should be traversable again', ->
      expect(trav.isTraversableAgain()).toBe true
      
    it 'should have a `isEmpty` method', ->
      expect(trav.isEmpty()).toBe false
      expect(emptyTrav.isEmpty()).toBe true
      
    it 'should have a defined size', ->
      expect(trav.hasDefinedSize()).toBe true

    it 'should have a `head` method', ->
      expect(trav.head()).toBe 1
      
    it 'should have a `drop` method', ->
      dropped = trav.drop(1)
      expect(dropped.size()).toBe 2
      expect(dropped.head()).toBe 2
      dropped2 = trav.drop(2)
      expect(dropped2.size()).toBe 1
      expect(dropped2.head()).toBe 3
      
    it 'should have a `addedAll` method', ->
      expect(emptyTrav.addedAll(emptyTrav).size()).toBe 0
      expect(trav.addedAll(emptyTrav).size()).toBe 3
      expect(emptyTrav.addedAll(trav).size()).toBe 3
      
      added = trav.addedAll(trav)
      expect(added.size()).toBe 6
      expect(added.drop(0).head()).toBe 1
      expect(added.drop(1).head()).toBe 2
      expect(added.drop(2).head()).toBe 3
      expect(added.drop(3).head()).toBe 1
      expect(added.drop(4).head()).toBe 2
      expect(added.drop(5).head()).toBe 3
