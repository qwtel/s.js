var s = require('../src/s.js');
var Class = require('../src/lang/Class.js').Class;
var Trait = require('../src/lang/Trait.js').Trait;

var Person = Class(function Person(name) {
  this.name = name;
}).body();

console.log(Person);

var p = new Person("Cell");

console.log(p);
console.log(p.name);

var Student = Class(function Student(name, number) {
  Person.call(this, name);
  this.number = number;
}).extends(Person).body();

console.log(Student);

var st = new Student("Cell", 123);

console.log(st);
console.log(st.name);
console.log(st.number);

var Printable = Trait(function Printable() {
}).body({
  name: Trait.required,
  print: function () {
    return 'Print ' + this.name;
  }
});

var PrintableStudent = Class(function PrintableStudent(name, number) {
  Student.call(this, name, number);
}).extends(Student).with(Printable).body();

console.log(PrintableStudent);

var pst = new PrintableStudent("Cell", 123);

console.log(pst);
console.log(pst.print());

var PrintStudentService = s.Singleton(function PrintStudentService() {
  this.serviceNumber = 0
}).with({
  print: function(student) {
    if (student.isInstanceOf('Printable'))
      return this.serviceNumber + ' ' + student.print()
  }
});

console.log(PrintStudentService);
console.log(PrintStudentService.print(pst));

