var argv = require('yargs').argv;

var gulp = require('gulp');
var browserify = require('gulp-browserify');

var coffee = require('gulp-coffee');
var jasmine = require('gulp-jasmine');

var paths = {
  js: '*.js',
  testCoffee: 'test/**/*.coffee'
};

gulp.task('development', ['watch']);

gulp.task('default', ['development']);

gulp.task('test', function () {
  var path = argv.file ? ('test/**/' + argv.file + '.coffee') : paths.testCoffee;
  gulp.src(path)
    .pipe(coffee())
    .pipe(gulp.dest('test'))
    .pipe(jasmine({
      verbose: !!argv.verbose, 
      includeStackTrace: !!argv.stack
    }));
});

gulp.task('dist', function() {
  gulp.src('src/s.js')
    .pipe(browserify({
      insertGlobals : true,
      debug : !gulp.env.production
    }))
    .pipe(gulp.dest('./dist'))
});
